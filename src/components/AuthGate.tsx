import React, { useState, useEffect } from 'react';
import { 
  getStoredFirebaseConfig, 
  saveAndInitializeFirebaseConfig, 
  isFirebaseConfigured,
  loginToFirebase,
  loginWithGoogle,
  resetPasswordViaEmail,
  ensureUserProfile,
  registerUserToFirebase,
  loadSubmissionsFromFirestore,
  getUserProfileFromFirestore
} from '../firebase';
import { Submission } from '../types';
import { NusantaraLogo } from './NusantaraLogo';
import { Key, Lock, Mail, UserCheck, ShieldCheck, Database, Info, Loader2, RefreshCw, ChevronRight, Eye, EyeOff } from 'lucide-react';

interface AuthGateProps {
  onLoginSuccess: (user: any, initialData: Submission[]) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'config'>('login');
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Form Fields - Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields - Register
  const [regFullName, setRegFullName] = useState('');
  const [regRole, setRegRole] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCompanyId, setRegCompanyId] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regLogoUrl, setRegLogoUrl] = useState('');
  const [regAppId, setRegAppId] = useState('');

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

    // Always start with login screen for a clean, professional, and elegant presentation
    setMode('login');
  }, []);

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
        text: 'Parameter Firebase berhasil ditautkan! Masuk atau daftarkan akun baru Anda di bawah.'
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
      text: 'Menghubungkan ke server autentikasi...'
    });

    try {
      const user = await loginToFirebase(loginEmail.trim(), loginPassword.trim());
      
      // Pull submissions
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
        text: `Sukses! Selamat datang kembali.`
      });
      
      setTimeout(() => {
        onLoginSuccess(user, cloudSubmissions);
      }, 500);
    } catch (err: any) {
      const isInvalidCred = err?.code === 'auth/invalid-credential' || String(err?.message).includes('invalid-credential');
      setStatusMsg({
        type: 'error',
        text: isInvalidCred
          ? 'Email atau kata sandi tidak cocok. Jika Anda belum mendaftar, silakan klik tab "Daftar Akun" di atas atau gunakan tombol "Masuk dengan Akun Google" di bawah.'
          : (err.message || 'Periksa kembali e-mail dan sandi Anda.')
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setStatusMsg(null);
    setIsLoading(true);
    setStatusMsg({
      type: 'info',
      text: 'Membuka jendela otentikasi akun Google...'
    });

    try {
      const user = await loginWithGoogle();
      
      setStatusMsg({
        type: 'info',
        text: `Otentikasi Google Sukses (${user.email})! Menyiapkan profil & memuat transaksi...`
      });

      // Ensure profile exists in Firestore
      await ensureUserProfile(user, {
        companyId: 'nmsa',
        companyName: 'PT Nusantara Mineral Sukses Abadi'
      });

      const profile = await getUserProfileFromFirestore(user.uid);
      const companyId = profile?.companyId || 'nmsa';

      let cloudSubmissions: Submission[] = [];
      try {
        cloudSubmissions = await loadSubmissionsFromFirestore(companyId);
      } catch (err: any) {
        console.warn('Silent read rejection on google login', err);
      }

      setStatusMsg({
        type: 'success',
        text: `Selamat datang, ${user.displayName || user.email}!`
      });

      setTimeout(() => {
        onLoginSuccess(user, cloudSubmissions);
      }, 500);
    } catch (err: any) {
      console.warn('Google login error:', err);
      setStatusMsg({
        type: 'error',
        text: err.message || 'Gagal masuk menggunakan Akun Google.'
      });
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

  const handleQuickSwitchToRegister = () => {
    setRegEmail(loginEmail.trim());
    setRegPassword(loginPassword.trim());
    setRegCompanyId('nmsa');
    setRegCompanyName('PT Nusantara Mineral Sukses Abadi');
    const activeConfig = getStoredFirebaseConfig();
    if (activeConfig?.appId) {
      setRegAppId(activeConfig.appId);
    }
    setMode('register');
    setStatusMsg({
      type: 'info',
      text: 'Silakan lengkapi Nama Lengkap & Jabatan Anda untuk menyelesaikan pendaftaran.'
    });
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!regFullName.trim() || !regEmail.trim() || !regPassword.trim() || !regRole.trim() || !regCompanyId.trim() || !regCompanyName.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Semua kolom pendaftaran wajib diisi secara lengkap.'
      });
      return;
    }

    if (regPassword.length < 6) {
      setStatusMsg({
        type: 'error',
        text: 'Password minimal terdiri dari 6 karakter.'
      });
      return;
    }

    const activeConfig = getStoredFirebaseConfig();
    const activeAppId = activeConfig?.appId || '';

    if (!regAppId.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Kode App ID wajib diisi untuk verifikasi database.'
      });
      return;
    }

    if (regAppId.trim() !== activeAppId) {
      setStatusMsg({
        type: 'error',
        text: 'Kode App ID salah! Anda harus mengisi Kode App ID dengan benar agar dapat terhubung dengan data perusahaan yang sudah ada. Jika Anda ingin membuat database di firebase yang baru, klik tombol "Database Baru" di samping kolom input.'
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
      text: 'Mendaftarkan akun baru & mencatat biodata pengguna...'
    });

    try {
      const activeCompanyId = regCompanyId.trim().toLowerCase();
      const activeCompanyName = regCompanyName.trim();

      const user = await registerUserToFirebase(
        regEmail.trim(),
        regPassword.trim(),
        regFullName.trim(),
        regRole.trim(),
        activeCompanyId,
        activeCompanyName,
        regLogoUrl.trim()
      );

      setStatusMsg({
        type: 'success',
        text: 'Pendaftaran Akun Berhasil! Mengambil database transaksi dari Firestore...'
      });

      let cloudSubmissions: Submission[] = [];
      try {
        cloudSubmissions = await loadSubmissionsFromFirestore(activeCompanyId);
      } catch (err: any) {
        console.warn('Silent read rejection on register', err);
      }

      setTimeout(() => {
        onLoginSuccess(user, cloudSubmissions);
      }, 500);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: `Pendaftaran gagal: ${err.message || 'Pastikan email belum terdaftar dan format password valid.'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center items-center p-4 relative antialiased">
      {/* Background Decorative Accent */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#d4af37_1.5px,transparent_1.5px)] [background-size:24px_24px]" />
      
      <div className="relative z-10 w-full max-w-md bg-white border border-stone-250 shadow-xl rounded-2xl overflow-hidden transition-all duration-300">
        
        {/* Banner header containing the brand */}
        <div className="bg-stone-900 px-6 py-8 text-center border-b border-stone-800 flex flex-col items-center justify-center space-y-4">
          
          {/* Logo container in elegant landscape layout */}
          <div className="w-full max-w-[280px] bg-stone-850/45 rounded-2xl px-5 py-4 flex items-center justify-center border border-stone-800/80 shadow-inner">
            <NusantaraLogo size="lg" className="w-[240px] justify-center" />
          </div>

          <div className="space-y-2">
            <h2 className="text-amber-500 text-xl font-black uppercase tracking-wide">
              Aplikasi Voucher
            </h2>
            <p className="text-white text-sm font-bold tracking-tight">
              PT. Nusantara Mineral Sukses Abadi
            </p>
            <div className="pt-1.5">
              <span className="inline-block text-[10.5px] italic font-mono text-stone-300 bg-stone-800/80 px-3 py-1 rounded-lg border border-stone-700">
                Aplikasi ini dibuat oleh : Nur Wahyudi
              </span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => {
              setMode('login');
              setStatusMsg(null);
            }}
            className={`flex-1 py-3 text-xs font-bold font-mono uppercase tracking-wider text-center border-b-2 transition ${
              mode === 'login'
                ? 'border-amber-500 text-stone-900 bg-stone-50/50'
                : 'border-transparent text-stone-400 hover:text-stone-700 hover:bg-stone-50/20'
            }`}
          >
            Masuk Sesi (Login)
          </button>
          <button
            onClick={() => {
              setMode('register');
              setStatusMsg(null);
            }}
            className={`flex-1 py-3 text-xs font-bold font-mono uppercase tracking-wider text-center border-b-2 transition ${
              mode === 'register'
                ? 'border-amber-500 text-stone-900 bg-stone-50/50'
                : 'border-transparent text-stone-400 hover:text-stone-700 hover:bg-stone-50/20'
            }`}
          >
            Daftar Akun
          </button>
        </div>

        {/* Form area */}
        <div className="p-6 space-y-4">
          
          {/* Uploader Section Specific Secure Warning Prompts */}
          {(window.location.hash === '#/input-bukti-transfer' || window.location.hash === '#input-bukti-transfer' || window.location.pathname === '/input-bukti-transfer') && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-300 rounded-xl text-amber-950 text-[11px] leading-relaxed flex items-start gap-2.5 select-none shadow-3xs">
              <Lock size={15} className="text-[#a58421] shrink-0 mt-0.5 animate-pulse" />
              <div>
                <strong>Otorisasi Area Pembayaran Keuangan:</strong> Silakan login terlebih dahulu menggunakan kredensial Staff/Accounting Anda untuk mengakses data transaksi dan modul unggah bukti bayar.
              </div>
            </div>
          )}

          {/* Status Message Display */}
          {statusMsg && (
            <div className={`p-3.5 border rounded-xl text-xs leading-relaxed space-y-2.5 font-medium ${
              statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800' :
              statusMsg.type === 'error' ? 'bg-rose-50 border-rose-250 text-rose-800' :
              'bg-amber-50 border-amber-200 text-amber-900 animate-pulse'
            }`}>
              <div className="flex items-start gap-2.5">
                {isLoading && statusMsg.type === 'info' ? (
                  <Loader2 size={14} className="animate-spin text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <Info size={14} className="shrink-0 mt-0.5" />
                )}
                <span className="flex-1">{statusMsg.text}</span>
              </div>

              {statusMsg.type === 'error' && mode === 'login' && (
                <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-rose-200/70">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-white hover:bg-stone-50 text-stone-850 border border-stone-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Coba Masuk dengan Google</span>
                  </button>

                  {loginEmail && (
                    <button
                      type="button"
                      onClick={handleQuickSwitchToRegister}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-lg text-[11px] transition shadow-2xs cursor-pointer"
                    >
                      Daftar Akun Baru dengan Email Ini ➔
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MODE 1: LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  ALAMAT E-MAIL RESMI
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400 pointer-events-none">
                    <Mail size={14} />
                  </span>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nama@nmsa.com"
                    disabled={isLoading}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-stone-800 placeholder:text-stone-300 transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                    SANDI KEAMANAN
                  </label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-bold transition hover:underline cursor-pointer"
                    title="Kirim email pemulihan sandi ke alamat email Anda"
                  >
                    Lupa Sandi?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400 pointer-events-none">
                    <Lock size={14} />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="w-full pl-10 pr-10 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-stone-800 placeholder:text-stone-300 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600 transition"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Memproses Otentikasi...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={13} />
                    Masuk ke Sistem HO
                  </>
                )}
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-stone-200"></div>
                <span className="flex-shrink mx-3 text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                  ATAU MASUK LEBIH MUDAH
                </span>
                <div className="flex-grow border-t border-stone-200"></div>
              </div>

              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full bg-white hover:bg-stone-50 text-stone-850 font-bold py-3 px-4 rounded-xl text-xs font-mono border border-stone-300 hover:border-stone-400 flex items-center justify-center gap-2.5 shadow-xs transition-all active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Masuk dengan Akun Google</span>
              </button>

              <div className="pt-2 text-center text-xs text-stone-400 font-mono">
                Belum memiliki akun? Silakan klik tab <button type="button" onClick={() => setMode('register')} className="text-amber-700 font-bold hover:underline cursor-pointer">Daftar Akun</button>.
              </div>

              {!(window.location.hash === '#/input-bukti-transfer' || window.location.hash === '#input-bukti-transfer' || window.location.pathname === '/input-bukti-transfer') && (
                <>
                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-stone-200"></div>
                    <span className="flex-shrink mx-4 text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">Portal Khusus Keuangan</span>
                    <div className="flex-grow border-t border-stone-200"></div>
                  </div>

                  <a
                    href="#/input-bukti-transfer"
                    className="w-full border border-amber-300 bg-amber-50/30 hover:bg-amber-50 text-amber-900 font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 transition duration-150 decoration-transparent hover:border-amber-450 hover:shadow-xs cursor-pointer"
                  >
                    <RefreshCw size={13} className="text-amber-500 animate-spin-slow" />
                    Input Bukti Pembayaran Keuangan ➔
                  </a>
                </>
              )}
            </form>
          )}

          {/* MODE 2: REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  NAMA LENGKAP
                </label>
                <input
                  type="text"
                  required
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="Nama Lengkap"
                  disabled={isLoading}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white text-stone-850 placeholder:text-stone-300 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  JABATAN (DEPARTEMEN)
                </label>
                <input
                  type="text"
                  required
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  placeholder="Divisi Keuangan / Accounting"
                  disabled={isLoading}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white text-stone-850 placeholder:text-stone-300 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  KODE APP ID (VERIFIKASI DATABASE)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={regAppId}
                    onChange={(e) => setRegAppId(e.target.value)}
                    placeholder="Masukkan Kode App ID..."
                    disabled={isLoading}
                    className="flex-1 px-3.5 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white text-stone-850 placeholder:text-stone-300 transition"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setMode('config');
                      setApiKey('');
                      setProjectId('');
                      setAuthDomain('');
                      setStorageBucket('');
                      setMessagingSenderId('');
                      setAppId('');
                      setStatusMsg({
                        type: 'info',
                        text: 'Silakan isi parameter Firebase di bawah untuk membuat atau menghubungkan ke database baru.'
                      });
                    }}
                    className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-[#D4AF37] border border-stone-800 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-3xs"
                    title="Buat / Setup Database Firebase Baru"
                  >
                    <Database size={13} />
                    <span>Database Baru</span>
                  </button>
                </div>
                <p className="text-[10px] text-stone-400">
                  Wajib mengisi Kode App ID dengan benar jika ingin bergabung dengan data yang sudah ada.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                    KODE PERUSAHAAN
                  </label>
                  <input
                    type="text"
                    required
                    value={regCompanyId}
                    onChange={(e) => setRegCompanyId(e.target.value.toLowerCase().trim())}
                    placeholder="nmsa"
                    disabled={isLoading}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white text-stone-850 placeholder:text-stone-300 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                    NAMA PERUSAHAAN
                  </label>
                  <input
                    type="text"
                    required
                    value={regCompanyName}
                    onChange={(e) => setRegCompanyName(e.target.value)}
                    placeholder="PT Nusantara Mineral"
                    disabled={isLoading}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white text-stone-850 placeholder:text-stone-300 transition"
                  />
                </div>
              </div>

              {/* Link Gambar Logo Perusahaan (ImgBB / URL) */}
              <div className="space-y-1.5 bg-stone-50/80 p-2.5 rounded-xl border border-stone-200">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-mono font-black text-stone-700 uppercase tracking-widest">
                    LINK LOGO PERUSAHAAN (IMGBB / URL GAMBAR)
                  </label>
                  {regLogoUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => setRegLogoUrl('')}
                      className="text-[9px] text-stone-400 hover:text-stone-600 font-mono underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="url"
                    value={regLogoUrl}
                    onChange={(e) => setRegLogoUrl(e.target.value)}
                    placeholder="https://i.ibb.co.com/gFHNJ1JD/LOGO-NH.png"
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-850 placeholder:text-stone-350 transition"
                  />
                  {regLogoUrl.trim() ? (
                    <div className="w-10 h-10 rounded-lg border border-stone-250 bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                      <img
                        src={regLogoUrl.trim()}
                        alt="Logo Preview"
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = 'https://i.ibb.co.com/gFHNJ1JD/LOGO-NH.png';
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRegLogoUrl('https://i.ibb.co.com/gFHNJ1JD/LOGO-NH.png')}
                      className="px-2.5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-[10px] font-mono font-semibold transition shrink-0 whitespace-nowrap"
                      title="Gunakan Logo Resmi NMSA"
                    >
                      Logo NMSA
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-stone-500 leading-tight">
                  Masukkan link gambar ImgBB atau web agar kop cetak surat menggunakan logo resmi perusahaan Anda.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  ALAMAT E-MAIL (FIRESTORE LOGIN)
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="nama@email.com"
                  disabled={isLoading}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white text-stone-850 placeholder:text-stone-300 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  PASSWORD BARU (MIN 6 KARAKTER)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Kata Sandi (min. 6 karakter)"
                  disabled={isLoading}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white text-stone-850 placeholder:text-stone-300 transition"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#D4AF37] hover:bg-[#bca031] text-stone-900 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] disabled:opacity-75"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Mendaftarkan Akun...
                  </>
                ) : (
                  <>
                    <UserCheck size={13} />
                    Buat Akun & Otomatis Masuk
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODE 3: CONFIGURATION SETUP */}
          {mode === 'config' && (
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl">
                <p className="text-[11px] leading-relaxed text-amber-900">
                  ⚠️ <strong>Database Utama Belum Terhubung:</strong> Silakan lengkapi parameter Web App SDK Firebase Firestore dari Konsol Firebase Anda di bawah ini agar portal sinkronisasi cloud aktif.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  API Key (apiKey) *
                </label>
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-250 rounded-xl text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  Project ID (projectId) *
                </label>
                <input
                  type="text"
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="pencatatan-voucher-perusahaan"
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-250 rounded-xl text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono font-black text-stone-500 uppercase tracking-widest">
                  App ID (appId) *
                </label>
                <input
                  type="text"
                  required
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1:84739572917:web:2c846d847..."
                  className="w-full px-3 py-1.5 bg-stone-50 border border-stone-250 rounded-xl text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono font-black text-stone-500 uppercase tracking-widest">
                    Auth Domain
                  </label>
                  <input
                    type="text"
                    value={authDomain}
                    onChange={(e) => setAuthDomain(e.target.value)}
                    placeholder="id.firebaseapp.com"
                    className="w-full px-3 py-1.5 bg-stone-50 border border-stone-250 rounded-xl text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono font-black text-stone-500 uppercase tracking-widest">
                    Storage Bucket
                  </label>
                  <input
                    type="text"
                    value={storageBucket}
                    onChange={(e) => setStorageBucket(e.target.value)}
                    placeholder="id.appspot.com"
                    className="w-full px-3 py-1.5 bg-stone-50 border border-stone-250 rounded-xl text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-1.5 shadow-xs transition"
              >
                <RefreshCw size={12} />
                Hubungkan & Aktifkan Firebase
              </button>

               {isConfigured && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setStatusMsg(null);
                    // Reload stored config to restore previous values
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
                  className="w-full bg-white hover:bg-stone-50 text-stone-600 border border-stone-250 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider font-mono text-center transition block"
                >
                  Batal / Kembali
                </button>
              )}
            </form>
          )}

        </div>

        {/* Footer brand details */}
        <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 text-center flex items-center justify-between gap-2 text-[10px] font-mono text-stone-400">
          <div className="flex items-center gap-1.5 select-none text-left">
            <Key size={11} className="text-amber-500 shrink-0" />
            <span>Otorisasi Multi-Faktor (HO)</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (mode === 'config') {
                setMode('login');
                // Reload stored config to restore previous values
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
                // Clear inputs for entering a brand new database configuration
                setApiKey('');
                setProjectId('');
                setAuthDomain('');
                setStorageBucket('');
                setMessagingSenderId('');
                setAppId('');
              }
              setStatusMsg(null);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold font-mono uppercase tracking-wider text-stone-500 hover:text-stone-800 bg-stone-100 border border-stone-250 rounded-lg hover:bg-stone-200 transition cursor-pointer"
            title="Sistem Setup Database Cloud"
          >
            <Database size={11} />
            <span>{mode === 'config' ? 'Selesai / Batal' : 'Setup Database'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

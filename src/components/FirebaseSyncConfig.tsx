import React, { useState, useEffect } from 'react';
import { 
  getStoredFirebaseConfig, 
  saveAndInitializeFirebaseConfig, 
  clearFirebaseConfig,
  isFirebaseConfigured,
  loadSubmissionsFromFirestore,
  saveSubmissionToFirestore,
  deleteSubmissionFromFirestore,
  loginToFirebase,
  logoutFromFirebase,
  registerAuthChangeListener
} from '../firebase';
import { Submission } from '../types';
import { Cloud, CloudOff, RefreshCw, Key, Check, Info, Trash2, Database, AlertCircle, LogIn, LogOut, ShieldCheck, UserCheck } from 'lucide-react';
import { User } from 'firebase/auth';

interface FirebaseSyncConfigProps {
  onSyncData: (cloudSubmissions: Submission[]) => void;
  submissions: Submission[];
  userProfile?: any;
}

export const FirebaseSyncConfig: React.FC<FirebaseSyncConfigProps> = ({ onSyncData, submissions, userProfile }) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [projectId, setProjectId] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');
  
  // Auth states
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sync state and listen for authorization
  useEffect(() => {
    const ready = isFirebaseConfigured();
    setIsConfigured(ready);
    
    // Autofill config fields if stored
    const config = getStoredFirebaseConfig();
    if (config) {
      setApiKey(config.apiKey || '');
      setAuthDomain(config.authDomain || '');
      setProjectId(config.projectId || '');
      setStorageBucket(config.storageBucket || '');
      setMessagingSenderId(config.messagingSenderId || '');
      setAppId(config.appId || '');
    }

    const unsubscribe = registerAuthChangeListener((user) => {
      setAuthUser(user);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSaveConfig = () => {
    setStatusMsg(null);
    if (!apiKey.trim() || !projectId.trim() || !appId.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'API Key, Project ID, dan App ID wajib diisi.'
      });
      return;
    }

    const configPayload = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim()
    };

    const success = saveAndInitializeFirebaseConfig(configPayload);
    if (success) {
      setIsConfigured(true);
      setStatusMsg({
        type: 'success',
        text: 'Konfigurasi Firebase berhasil disimpan! Hubungkan akun Anda untuk membaca atau menyimpan data.'
      });
      setShowConfigPanel(false);
      setShowLoginPanel(true);
    } else {
      setIsConfigured(false);
      setStatusMsg({
        type: 'error',
        text: 'Inisialisasi Firebase gagal. Mohon periksa kembali kredensial Anda.'
      });
    }
  };

  const handleDisconnect = () => {
    if (window.confirm('Apakah Anda yakin ingin memutuskan sinkronisasi Firebase Cloud? Aplikasi akan beralih menggunakan Penyimpanan Lokal.')) {
      clearFirebaseConfig();
      setIsConfigured(false);
      setAuthUser(null);
      setStatusMsg({
        type: 'info',
        text: 'Firebase Cloud berhasil diputuskan. Kembali ke modus Penyimpanan Lokal (LocalStorage).'
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Kombinasi Email dan Password wajib diisi.'
      });
      return;
    }

    setIsLoading(true);
    setStatusMsg({ type: 'info', text: 'Melakukan autentikasi secara aman di Firebase...' });
    try {
      const user = await loginToFirebase(loginEmail.trim(), loginPassword.trim());
      setAuthUser(user);
      setStatusMsg({
        type: 'success',
        text: `Autentikasi Berhasil! Selamat datang ${user.email}. Melakukan sinkronisasi data cloud sekarang...`
      });
      setLoginEmail('');
      setLoginPassword('');
      setShowLoginPanel(false);
      
      // Auto fetch live cloud data as soon as authenticated successfully
      await handleFetchLiveCloud();
    } catch (err: any) {
      const isInvalidCred = err?.code === 'auth/invalid-credential' || String(err?.message).includes('invalid-credential');
      const isOpNotAllowed = err?.code === 'auth/operation-not-allowed' || String(err?.message).includes('operation-not-allowed');
      setStatusMsg({
        type: 'error',
        text: isOpNotAllowed
          ? 'Fitur login Email & Sandi belum diaktifkan di Firebase Console untuk project ini. Aktifkan provider Email/Password di Firebase Authentication.'
          : (isInvalidCred
            ? 'Email atau kata sandi tidak cocok. Akses privat terbatas hanya untuk akun resmi yang telah didaftarkan manual oleh Administrator di Firebase Console.'
            : (err.message || 'Periksa email & kata sandi Anda.'))
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Keluar dari sesi Firebase secara aman?')) {
      setIsLoading(true);
      try {
        await logoutFromFirebase();
        setAuthUser(null);
        setStatusMsg({
          type: 'info',
          text: 'Anda telah keluar dari sesi Firebase Auth secara aman. Sesi cloud diakhiri.'
        });
      } catch (err: any) {
        setStatusMsg({
          type: 'error',
          text: `Gagal Log Out: ${err.message}`
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleFetchLiveCloud = async () => {
    setIsLoading(true);
    const uCompanyId = userProfile?.companyId;
    setStatusMsg({ 
      type: 'info', 
      text: `Menarik riwayat data terbaru dari Firebase Firestore${uCompanyId ? ` untuk perusahaan [${uCompanyId.toUpperCase()}]` : ''}...` 
    });
    try {
      const data = await loadSubmissionsFromFirestore(uCompanyId);
      onSyncData(data);
      setStatusMsg({
        type: 'success',
        text: `Berhasil tersinkronisasi! Memuat ${data.length} transaksi secara aman dari Firestore${uCompanyId ? ` untuk Perusahaan [${uCompanyId.toUpperCase()}]` : ''}.`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: `Gagal sinkronisasi data cloud: Permisi ditolak atau periksa koneksi. Pastikan akun Anda sudah terdaftar di Firebase Auth dan memiliki izin baca.`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Push all existing local data to cloud in a single sync operation
  const handlePushToCloud = async () => {
    if (!authUser) {
      setStatusMsg({
        type: 'error',
        text: 'Silakan Login ke Firebase terlebih dahulu sebelum melakukan ekspor masal / migrasi.'
      });
      setShowLoginPanel(true);
      return;
    }

    if (submissions.length === 0) {
      alert('Tidak ada data lokal saat ini untuk dipublikasikan ke cloud.');
      return;
    }

    const activeCompId = userProfile?.companyId || 'nmsa';
    const activeCompName = userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi';

    if (!window.confirm(`FITUR MIGRASI DATA: Sistem akan mengekspor & mengunggah ${submissions.length} transaksi lokal Anda ke database cloud Firebase baru di bawah identitas Perusahaan: [${activeCompId.toUpperCase()}] (${activeCompName}). Lanjutkan?`)) {
      return;
    }

    setIsLoading(true);
    setStatusMsg({ type: 'info', text: `Menjalankan proses migrasi data lokal ke cloud Firebase untuk perusahaan [${activeCompId.toUpperCase()}]...` });
    try {
      let successCount = 0;
      for (const sub of submissions) {
        await saveSubmissionToFirestore(sub, activeCompId, activeCompName);
        successCount++;
      }
      setStatusMsg({
        type: 'success',
        text: `MIGRASI SUKSES! Berhasil memindahkan total ${successCount} riwayat transaksi ke cloud Firebase baru secara otomatis!`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: 'Gagal mengunggah dokumen migrasi. Pastikan Anda memiliki hak akses menulis pada aturan firestore.rules.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-3xs space-y-4 print:hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${isConfigured ? 'bg-amber-50 text-[#D4AF37]' : 'bg-stone-50 text-stone-400'}`}>
            {isConfigured ? <Cloud size={20} className={authUser ? 'animate-none' : 'animate-pulse'} /> : <CloudOff size={20} />}
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              Status Database Cloud (Firebase Firestore)
              {authUser && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-250 px-2 py-0.5 rounded-full font-mono font-semibold">
                  <UserCheck size={10} /> Authenticated
                </span>
              )}
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              {isConfigured 
                ? (
                  <span>
                    Secara aktif tersambung ke project cloud: <strong>{projectId}</strong>. 
                    {authUser 
                      ? ` Aktif sebagai user: ${authUser.email}`
                      : ' Masih memerlukan autentikasi login agar dapat tersambung secara penuh.'
                    }
                  </span>
                )
                : 'Belum tersambung ke database Firebase. Menggunakan penyimpanan peramban lokal (LocalStorage).'
              }
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {isConfigured ? (
            <>
              {authUser ? (
                <>
                  <button
                    onClick={handleFetchLiveCloud}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition flex items-center gap-1"
                  >
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                    Tarik Cloud (Pull)
                  </button>
                  <button
                    onClick={handlePushToCloud}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 rounded-xl transition flex items-center gap-1 shadow-3xs"
                  >
                    <Database size={12} />
                    Ekspor Massal
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-stone-50 hover:bg-stone-150 text-stone-600 rounded-xl transition flex items-center gap-1"
                  >
                    <LogOut size={12} />
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLoginPanel(!showLoginPanel)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-3xs cursor-pointer ${
                    showLoginPanel ? 'bg-amber-100 text-amber-950 border border-amber-300' : 'bg-stone-900 hover:bg-stone-800 text-white'
                  }`}
                >
                  <LogIn size={13} />
                  <span>Login Akun Terdaftar</span>
                </button>
              )}
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition flex items-center gap-1 cursor-pointer"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="px-3.5 py-1.5 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition flex items-center gap-1 shadow-3xs cursor-pointer"
            >
              <Key size={12} />
              Hubungkan Firebase
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3 border rounded-xl text-xs flex items-start gap-2 font-medium ${
          statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800' :
          statusMsg.type === 'error' ? 'bg-rose-50 border-rose-250 text-rose-800' :
          'bg-amber-50 border-amber-250 text-amber-800'
        }`}>
          {statusMsg.type === 'success' ? <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
          <span className="leading-relaxed">{statusMsg.text}</span>
        </div>
      )}

      {/* LOGIN PANEL - EXCLUSIVELY FOR REGISTERED ACCOUNTS */}
      {isConfigured && !authUser && showLoginPanel && (
        <form onSubmit={handleLogin} className="p-4 bg-stone-50 border border-amber-300/80 rounded-2xl space-y-3.5 animate-slide-down">
          <div className="flex gap-2.5 items-start text-xs text-stone-600 leading-relaxed border-b border-stone-200 pb-2.5">
            <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-stone-900 block font-bold">Akses Khusus Akun Terdaftar:</strong>
              Aplikasi ini berstatus tertutup. Masukkan akun resmi yang telah didaftarkan manual oleh Administrator di Firebase Authentication Console.
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Alamat E-mail Terdaftar
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="nama@nmsa.com"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Kata Sandi
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setShowLoginPanel(false)}
              className="px-3 py-1.5 text-xs font-bold bg-white border border-stone-250 hover:bg-stone-50 text-stone-700 rounded-lg transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-lg transition shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer font-mono uppercase tracking-wider"
            >
              <LogIn size={13} />
              {isLoading ? 'Mengautentikasi...' : 'Masuk Sesi'}
            </button>
          </div>
        </form>
      )}

      {/* CONFIGURATION PANEL */}
      {(showConfigPanel || (!isConfigured && statusMsg?.type === 'error')) && (
        <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-4 animate-slide-down">
          <div className="flex gap-2 items-start text-xs text-stone-500 leading-relaxed border-b border-stone-200 pb-3">
            <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p>
              Masukkan kredensial <strong>Firebase Web App SDK Configuration</strong> Anda. Informasi ini disimpan di browser Anda Anda sendiri, sehingga 100% aman dan tidak terekspos secara publik.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                API Key *
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSyA..."
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Project ID *
              </label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="project-id-123"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Auth Domain
              </label>
              <input
                type="text"
                value={authDomain}
                onChange={(e) => setAuthDomain(e.target.value)}
                placeholder="project-id-123.firebaseapp.com"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Storage Bucket
              </label>
              <input
                type="text"
                value={storageBucket}
                onChange={(e) => setStorageBucket(e.target.value)}
                placeholder="project-id-123.appspot.com"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                Messaging Sender ID
              </label>
              <input
                type="text"
                value={messagingSenderId}
                onChange={(e) => setMessagingSenderId(e.target.value)}
                placeholder="84739572917"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                App ID *
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="1:84739572917:web:2c846d847"
                className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowConfigPanel(false)}
              className="px-3.5 py-1.5 text-xs font-bold bg-white border border-stone-250 hover:bg-stone-50 text-stone-700 rounded-lg transition"
            >
              Batal
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-3.5 py-1.5 text-xs font-bold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 rounded-lg transition shadow-3xs"
            >
              Simpan & Hubungkan
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


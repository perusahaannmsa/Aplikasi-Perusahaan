import React, { useState, useEffect } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, User as FirebaseUser } from 'firebase/auth';
import { Submission } from '../types';
import { 
  getStoredFirebaseConfig, 
  saveAndInitializeFirebaseConfig, 
  clearFirebaseConfig,
  mapSubmissionToFirestore, 
  cleanUndefined,
  loadAllCompaniesFromFirestore,
  loadNpwpRecordsFromFirestore,
  loadSppdRecordsFromFirestore,
  loadAccurateMappingsFromFirestore,
  loadAbsenDataFromFirestore
} from '../firebase';
import { 
  Database, 
  ArrowRight, 
  CheckCircle2, 
  RefreshCw, 
  ShieldCheck, 
  UserPlus, 
  LogIn, 
  Check, 
  Info, 
  ServerCrash,
  Sparkles,
  Download,
  Copy,
  Layers,
  ArrowLeftRight,
  FileText,
  Building2,
  Receipt,
  Briefcase,
  Users,
  Settings,
  X,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

interface FirebaseMigrationProps {
  submissions: Submission[];
  userProfile?: any;
  onMigrationComplete: () => void;
  isModalDirect?: boolean;
  onCloseModal?: () => void;
}

export const FirebaseMigration: React.FC<FirebaseMigrationProps> = ({ 
  submissions, 
  userProfile,
  onMigrationComplete,
  isModalDirect = false,
  onCloseModal
}) => {
  const [isOpen, setIsOpen] = useState(isModalDirect);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active Firebase config info
  const currentConfig = getStoredFirebaseConfig();
  const currentProjectId = currentConfig?.projectId || 'pencatatan-voucher-perusahaan';
  const isCustomConfigActive = Boolean(localStorage.getItem('NUSANTARA_FIREBASE_CONFIG'));

  // Counts of collections to migrate
  const [counts, setCounts] = useState<{
    submissions: number;
    companies: number;
    npwp: number;
    sppd: number;
    accurate: number;
    absen: number;
  }>({
    submissions: submissions.length,
    companies: 1,
    npwp: 0,
    sppd: 0,
    accurate: 0,
    absen: 0
  });

  // What to include in migration
  const [includeOptions, setIncludeOptions] = useState({
    submissions: true,
    companies: true,
    npwp: true,
    sppd: true,
    accurate: true,
    absen: true,
    settings: true
  });

  // Load actual counts from local/remote collections
  useEffect(() => {
    let isMounted = true;
    const loadCounts = async () => {
      try {
        const [compList, npwpList, sppdList, accList, absenList] = await Promise.all([
          loadAllCompaniesFromFirestore().catch(() => []),
          loadNpwpRecordsFromFirestore().catch(() => []),
          loadSppdRecordsFromFirestore().catch(() => []),
          loadAccurateMappingsFromFirestore().catch(() => []),
          loadAbsenDataFromFirestore().catch(() => [])
        ]);
        if (isMounted) {
          setCounts({
            submissions: submissions.length,
            companies: Math.max(1, compList.length),
            npwp: npwpList.length,
            sppd: sppdList.length,
            accurate: accList.length,
            absen: absenList.length
          });
        }
      } catch (err) {
        console.warn('Failed loading collection counts for migration:', err);
      }
    };
    loadCounts();
    return () => {
      isMounted = false;
    };
  }, [submissions]);

  // Form New Project Credentials
  const [targetApiKey, setTargetApiKey] = useState('');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetAuthDomain, setTargetAuthDomain] = useState('');
  const [targetStorageBucket, setTargetStorageBucket] = useState('');
  const [targetMessagingSenderId, setTargetMessagingSenderId] = useState('');
  const [targetAppId, setTargetAppId] = useState('');

  // Paste / Auto-parse SDK code
  const [rawSdkCode, setRawSdkCode] = useState('');

  const parseFirebaseConfigFromCode = (code: string) => {
    setRawSdkCode(code);
    if (!code.trim()) return;

    const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const extracted: { [key: string]: string } = {};

    keys.forEach(key => {
      const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"\`]([^'"\`\\s,;]+)['"\`]`, 'i');
      const match = code.match(regex);
      if (match && match[1]) {
        extracted[key] = match[1].trim();
      }
    });

    if (Object.keys(extracted).length > 0) {
      if (extracted.apiKey) setTargetApiKey(extracted.apiKey);
      if (extracted.projectId) setTargetProjectId(extracted.projectId);
      if (extracted.authDomain) setTargetAuthDomain(extracted.authDomain);
      if (extracted.storageBucket) setTargetStorageBucket(extracted.storageBucket);
      if (extracted.messagingSenderId) setTargetMessagingSenderId(extracted.messagingSenderId);
      if (extracted.appId) setTargetAppId(extracted.appId);
      
      setSuccessMsg('KODE SDK TERDETEKSI! Parameter Firebase berhasil di-parse secara otomatis.');
      setErrorMsg(null);
    } else {
      if (code.includes('apiKey') || code.includes('{')) {
        setErrorMsg('Peringatan: Gagal membaca parameter dari salinan kode. Silakan isi form di bawah secara manual.');
      }
    }
  };

  // Form Target User Credentials
  const [targetEmail, setTargetEmail] = useState(userProfile?.email || 'admin@perusahaandrive.com');
  const [targetPassword, setTargetPassword] = useState('');
  const [targetFullName, setTargetFullName] = useState(userProfile?.fullName || 'Nur Wahyudi');
  const [targetRole, setTargetRole] = useState(userProfile?.role || 'Keuangan');
  const [targetCompanyId, setTargetCompanyId] = useState(userProfile?.companyId || 'nmsa');
  const [targetCompanyName, setTargetCompanyName] = useState(userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi');

  // Secondary dynamic Firebase reference
  const [targetAppInstance, setTargetAppInstance] = useState<any | null>(null);
  const [targetAuthInstance, setTargetAuthInstance] = useState<any | null>(null);
  const [targetDbInstance, setTargetDbInstance] = useState<any | null>(null);
  const [targetUser, setTargetUser] = useState<FirebaseUser | null>(null);

  // Migration progress states
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationProgress, setMigrationProgress] = useState(0);

  // Clear previous dynamic firebase apps to avoid memory leaks
  useEffect(() => {
    return () => {
      cleanupMigrationApp();
    };
  }, [targetAppInstance]);

  const cleanupMigrationApp = () => {
    if (targetAppInstance) {
      try {
        deleteApp(targetAppInstance)
          .then(() => console.log('🗑️ Dynamic migration firebase instance disposed.'))
          .catch(e => console.warn('Disposing dynamic app error:', e));
      } catch (e) {
        console.error(e);
      }
    }
  };

  // One-click Download Full Offline JSON Backup
  const handleDownloadFullBackup = async () => {
    setIsExportingJson(true);
    setErrorMsg(null);
    try {
      const [compList, npwpList, sppdList, accList, absenList] = await Promise.all([
        loadAllCompaniesFromFirestore().catch(() => []),
        loadNpwpRecordsFromFirestore().catch(() => []),
        loadSppdRecordsFromFirestore().catch(() => []),
        loadAccurateMappingsFromFirestore().catch(() => []),
        loadAbsenDataFromFirestore().catch(() => [])
      ]);

      const rawHolders = localStorage.getItem('petty_cash_holders_v2');
      const holders = rawHolders ? JSON.parse(rawHolders) : [];

      const fullBackup = {
        app: 'Nusantara-Mineral-HO-Portal',
        version: '2.0-full-migration-export',
        exportedAt: new Date().toISOString(),
        sourceProjectId: currentProjectId,
        user: userProfile?.email || 'keuangan',
        summary: {
          submissions: submissions.length,
          companies: compList.length,
          npwp_records: npwpList.length,
          sppd_records: sppdList.length,
          accurate_mappings: accList.length,
          absen_records: absenList.length
        },
        data: {
          submissions,
          companies: compList,
          npwp_records: npwpList,
          sppd_records: sppdList,
          accurate_mappings: accList,
          absen_records: absenList,
          pettyCashHolders: holders,
          userProfile
        }
      };

      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_lengkap_firebase_nmsa_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg('✓ File cadangan JSON lengkap berhasil diunduh ke komputer Anda!');
    } catch (err: any) {
      setErrorMsg('Gagal membuat cadangan JSON: ' + (err.message || 'Error tidak dikenal'));
    } finally {
      setIsExportingJson(false);
    }
  };

  // Step 2: Establish connection to the empty target Firebase project
  const handleTestTargetConnection = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!targetApiKey.trim() || !targetProjectId.trim() || !targetAppId.trim()) {
      setErrorMsg('Kredensial API Key, Project ID, dan App ID wajib diisi!');
      return;
    }

    setIsLoading(true);
    setMigrationLogs(['Menghubungkan ke project Firebase baru...', `Project ID: ${targetProjectId.trim()}`]);

    try {
      cleanupMigrationApp();

      const uniqueAppName = 'target-migration-app-' + Date.now();
      const targetConfig = {
        apiKey: targetApiKey.trim(),
        projectId: targetProjectId.trim(),
        authDomain: targetAuthDomain.trim() || `${targetProjectId.trim()}.firebaseapp.com`,
        storageBucket: targetStorageBucket.trim() || `${targetProjectId.trim()}.appspot.com`,
        messagingSenderId: targetMessagingSenderId.trim(),
        appId: targetAppId.trim()
      };

      const appInstance = initializeApp(targetConfig, uniqueAppName);
      const authInstance = getAuth(appInstance);
      const dbInstance = getFirestore(appInstance);

      setTargetAppInstance(appInstance);
      setTargetAuthInstance(authInstance);
      setTargetDbInstance(dbInstance);

      setSuccessMsg('Koneksi ke Project Firebase baru berhasil dibentuk! Silakan siapkan autentikasi akun baru Anda.');
      setMigrationLogs(prev => [...prev, '✓ Koneksi berhasil!', 'Lanjutkan ke Tahap 3 untuk membuat akun atau melewati autentikasi.']);
      setCurrentStep(3);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Inisialisasi Gagal: ${err.message || 'Mohon periksa kembali API Key dan format input kredensial Anda.'}`);
      setMigrationLogs(prev => [...prev, '❌ Koneksi gagal: ' + (err.message || 'Error tidak dikenal')]);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Register or Login Account in Target Firebase Project
  const handleTargetAuthentication = async (type: 'signup' | 'signin') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!targetAuthInstance || !targetDbInstance) {
      setErrorMsg('Koneksi Firebase target belum siap. Silakan kembali ke Tahap 2.');
      return;
    }

    if (!targetEmail.trim() || !targetPassword.trim()) {
      setErrorMsg('Email dan Password wajib diisi untuk autentikasi target.');
      return;
    }

    if (type === 'signup') {
      if (!targetFullName.trim() || !targetCompanyId.trim() || !targetCompanyName.trim()) {
        setErrorMsg('Data Registrasi Lengkap (Nama, Kode Perusahaan & Nama Perusahaan) wajib diisi untuk pendaftaran project baru.');
        return;
      }
      if (targetPassword.length < 6) {
        setErrorMsg('Password akun target minimal harus 6 karakter.');
        return;
      }
    }

    setIsLoading(true);
    setMigrationLogs(prev => [...prev, `${type === 'signup' ? 'Mendaftarkan akun baru' : 'Masuk ke akun lama'} di project Firebase Baru...`, `User: ${targetEmail.trim()}`]);

    try {
      let credentials;
      if (type === 'signup') {
        credentials = await createUserWithEmailAndPassword(targetAuthInstance, targetEmail.trim(), targetPassword);
      } else {
        credentials = await signInWithEmailAndPassword(targetAuthInstance, targetEmail.trim(), targetPassword);
      }

      const activeUser = credentials.user;
      setTargetUser(activeUser);

      setSuccessMsg(`Autentikasi Akun Baru Sukses! Terbaca sebagai ${activeUser.email}. Siap untuk ekspor data.`);
      setMigrationLogs(prev => [
        ...prev, 
        `✓ Akun berhasil terotentikasi di project target! (UID: ${activeUser.uid})`,
        'Semua persyaratan terpenuhi. Lanjutkan ke Tahap 4 untuk memulai migrasi data.'
      ]);
      setCurrentStep(4);
    } catch (err: any) {
      console.error(err);
      let customError = `Otentikasi Gagal: ${err.message || 'Terjadi kendala saat menghubungi Firebase Auth.'}`;
      if (err.code === 'auth/configuration-not-found' || err.message?.includes('configuration-not-found')) {
        customError = `Otentikasi Gagal: Fitur Email/Password Sign-In Method belum diaktifkan di Firebase Console target Anda. Anda dapat mengaktifkannya di Firebase Console > Authentication > Sign-in method, ATAU klik "Lewati Otentikasi (Bypass)" di bawah untuk langsung memindahkan data ke Firestore (Test Mode)!`;
      }
      setErrorMsg(customError);
      setMigrationLogs(prev => [...prev, `❌ Gagal otentikasi: ${err.message || 'Kredensial atau Aturan Keamanan Ditolak.'}`]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper inside step 3 to bypass auth if rules are in test mode / open
  const handleBypassAuthentication = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const randomId = Math.random().toString(36).substring(2, 9);
    const mockUser = {
      uid: `migrated_user_${randomId}`,
      email: targetEmail.trim() || userProfile?.email || 'admin@nmsa.com',
    } as any;

    setTargetUser(mockUser);
    setSuccessMsg('Otentikasi Dilewati! Data akan langsung ditransfer ke database Firestore target (Mode Bebas/Terbuka).');
    setMigrationLogs(prev => [
      ...prev,
      '⚡ User memilih Lewati Otentikasi (Open/Test Mode).',
      `✓ Menggunakan profil target: ${mockUser.email}`,
      'Lanjutkan ke Tahap 4 untuk mentransfer data.'
    ]);
    setCurrentStep(4);
  };

  // Step 4: Run Mass Safe Copying of ALL Data to Target Firestore Database
  const handleRunMassMigration = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!targetDbInstance || !targetUser) {
      setErrorMsg('Target Database atau otentikasi belum siap. Silakan selesaikan tahap sebelumnya.');
      return;
    }

    setIsLoading(true);
    setMigrationProgress(0);
    setMigrationLogs(prev => [
      ...prev, 
      '======= MEMULAI SALIN MASSAL SELURUH DATA KE FIREBASE BARU =======',
      `Target Project ID: ${targetProjectId.trim()}`
    ]);

    try {
      const activeCompId = targetCompanyId.trim().toLowerCase();
      const activeCompName = targetCompanyName.trim();
      const targetUid = targetUser.uid;
      const targetUserEmail = targetUser.email || targetEmail.trim();

      let totalItemsCopied = 0;

      // 1. Tulis profil pengguna ke users/
      setMigrationLogs(prev => [...prev, '👤 Menulis profil pengguna ke users/ target...']);
      await setDoc(doc(targetDbInstance, 'users', targetUid), cleanUndefined({
        uid: targetUid,
        email: targetUserEmail,
        fullName: targetFullName.trim(),
        role: targetRole.trim() || 'Accounting',
        companyId: activeCompId,
        companyName: activeCompName,
        createdAt: new Date().toISOString()
      }));
      setMigrationLogs(prev => [...prev, '✓ Profil pengguna berhasil direkam.']);
      totalItemsCopied++;

      // 2. Tulis seluruh profil perusahaan ke companies/
      if (includeOptions.companies) {
        setMigrationLogs(prev => [...prev, '🏢 Membaca dan menyalin seluruh Profil Perusahaan...']);
        const allCompanies = await loadAllCompaniesFromFirestore().catch(() => []);
        
        // Ensure default company profile is present
        const hasActiveComp = allCompanies.some((c: any) => (c.id || c.code || '').toLowerCase().trim() === activeCompId);
        if (!hasActiveComp) {
          allCompanies.push({
            id: activeCompId,
            code: activeCompId.toUpperCase(),
            name: activeCompName,
            fullName: activeCompName,
            defaultJenis: 'Operasional Kantor',
            defaultKode: `BKK-${activeCompId.toUpperCase()}/V/2026/10001`,
            defaultLokasi: 'Lt.1',
            displayName: `Invoice-${activeCompId.toUpperCase()}`,
            icon: '🏢',
            isActive: true,
            sigAccounting: 'Sri Ekowati',
            sigDibuat: targetFullName.trim() || 'Nur Wahyudi',
            sigDirKeuangan: 'Harijon',
            sigDirektur: 'Andi Nursyam Halid',
            sigDisetujui: 'Harijon',
            sigKeuangan: 'Andi Dhiya Salsabila'
          });
        }

        for (const comp of allCompanies) {
          const cId = (comp.id || comp.code || activeCompId).toLowerCase().trim();
          await setDoc(doc(targetDbInstance, 'companies', cId), cleanUndefined({
            ...comp,
            id: cId,
            updatedAt: new Date().toISOString()
          }));
          totalItemsCopied++;
        }
        setMigrationLogs(prev => [...prev, `✓ ${allCompanies.length} profil perusahaan berhasil disalin.`]);
      }

      // 3. Tulis seluruh dokumen transaksi submissions ke submissions/
      if (includeOptions.submissions && submissions.length > 0) {
        setMigrationLogs(prev => [...prev, `🚚 Mulai menyalin ${submissions.length} transaksi voucher BKK/BKM...`]);
        let count = 0;
        
        for (const sub of submissions) {
          const fPayload = mapSubmissionToFirestore(
            sub,
            targetUserEmail,
            targetUid,
            activeCompId,
            activeCompName
          );
          await setDoc(doc(targetDbInstance, 'submissions', sub.id), cleanUndefined(fPayload));
          count++;
          totalItemsCopied++;
          
          const percent = Math.round((count / submissions.length) * 70);
          setMigrationProgress(percent);
          
          if (count % 10 === 0 || count === submissions.length) {
            setMigrationLogs(prev => [...prev, `-> Menyalin transaksi [${count}/${submissions.length}] - ${sub.kode}`]);
          }
        }
        setMigrationLogs(prev => [...prev, `✓ ${count} dokumen transaksi berhasil disalin.`]);
      }

      // 4. Tulis master NPWP records
      if (includeOptions.npwp) {
        setMigrationLogs(prev => [...prev, '📋 Menyalin Master NPWP & Vendor Rekanan...']);
        const npwpList = await loadNpwpRecordsFromFirestore().catch(() => []);
        for (const rec of npwpList) {
          if (rec.id) {
            await setDoc(doc(targetDbInstance, 'npwp_records', rec.id), cleanUndefined(rec));
            totalItemsCopied++;
          }
        }
        setMigrationLogs(prev => [...prev, `✓ ${npwpList.length} data NPWP berhasil disalin.`]);
      }

      // 5. Tulis SPPD records
      if (includeOptions.sppd) {
        setMigrationLogs(prev => [...prev, '✈️ Menyalin Formulir & SPPD Dinas...']);
        const sppdList = await loadSppdRecordsFromFirestore().catch(() => []);
        for (const sp of sppdList) {
          if (sp.id) {
            await setDoc(doc(targetDbInstance, 'sppd_records', sp.id), cleanUndefined(sp));
            totalItemsCopied++;
          }
        }
        setMigrationLogs(prev => [...prev, `✓ ${sppdList.length} data SPPD berhasil disalin.`]);
      }

      // 6. Tulis Accurate Mappings
      if (includeOptions.accurate) {
        setMigrationLogs(prev => [...prev, '📊 Menyalin Pemetaan Akun Accurate Online...']);
        const accList = await loadAccurateMappingsFromFirestore().catch(() => []);
        for (const acc of accList) {
          if (acc.id) {
            await setDoc(doc(targetDbInstance, 'accurate_mappings', acc.id), cleanUndefined(acc));
            totalItemsCopied++;
          }
        }
        setMigrationLogs(prev => [...prev, `✓ ${accList.length} pemetaan akun Accurate berhasil disalin.`]);
      }

      // 7. Tulis data Absensi
      if (includeOptions.absen) {
        setMigrationLogs(prev => [...prev, '🕒 Menyalin Data & Rekap Absensi Harian...']);
        const absenList = await loadAbsenDataFromFirestore().catch(() => []);
        for (const ab of absenList) {
          const docId = ab.id || `absen-${Date.now()}`;
          await setDoc(doc(targetDbInstance, 'absen_records', docId), cleanUndefined(ab));
          totalItemsCopied++;
        }
        setMigrationLogs(prev => [...prev, `✓ ${absenList.length} data absensi berhasil disalin.`]);
      }

      // 8. Tulis Pengaturan Sistem & Pemegang Petty Cash
      if (includeOptions.settings) {
        setMigrationLogs(prev => [...prev, '⚙️ Menyalin Konfigurasi Sistem & Pemegang Petty Cash...']);
        const rawHolders = localStorage.getItem('petty_cash_holders_v2');
        const holders = rawHolders ? JSON.parse(rawHolders) : [];
        await setDoc(doc(targetDbInstance, 'company_settings', 'default'), cleanUndefined({
          pettyCashHolders: holders,
          updatedAt: new Date().toISOString()
        }));
        totalItemsCopied++;
        setMigrationLogs(prev => [...prev, '✓ Konfigurasi sistem berhasil disalin.']);
      }

      // 9. Catat Log Riwayat di project target
      const logId = `log-migrasi-${Date.now()}`;
      await setDoc(doc(targetDbInstance, 'activity_logs', logId), {
        id: logId,
        timestamp: new Date().toISOString(),
        userId: targetUid,
        userEmail: targetUserEmail,
        userName: targetFullName.trim(),
        action: 'migration_data',
        details: `Berhasil menyalin total ${totalItemsCopied} data ke Firebase Project: ${targetProjectId.trim()}`,
        category: 'success'
      });

      setMigrationProgress(100);
      setSuccessMsg(`Migrasi Berhasil 100%! Seluruh data (${totalItemsCopied} item/dokumen) telah tersalin aman ke Project ID: ${targetProjectId.trim()}.`);
      setMigrationLogs(prev => [
        ...prev,
        '✨ Proses upload data selesai!',
        `✓ Migrasi database cloud diproses 100% SUKSES (${totalItemsCopied} data).`,
        'Silakan lanjutkan ke Tahap 5 untuk memilih apakah ingin mengaktifkan project baru di aplikasi ini.'
      ]);
      setCurrentStep(5);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Migrasi Terhenti: ${err.message || 'Error saat menulis data ke Firestore.'}`);
      setMigrationLogs(prev => [
        ...prev, 
        `❌ Gagal tulis data: ${err.message || 'Aturan Firestore ditolak. Harap deploy aturan firestore.rules pada Project target Anda.'}`
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 5: Save target config as active default and refresh
  const handlePromoteAndFinalize = () => {
    if (!targetApiKey || !targetProjectId || !targetAppId) {
      alert('Kredensial project baru tidak lengkap.');
      return;
    }

    const payload = {
      apiKey: targetApiKey.trim(),
      authDomain: targetAuthDomain.trim() || `${targetProjectId.trim()}.firebaseapp.com`,
      projectId: targetProjectId.trim(),
      storageBucket: targetStorageBucket.trim() || `${targetProjectId.trim()}.appspot.com`,
      messagingSenderId: targetMessagingSenderId.trim(),
      appId: targetAppId.trim()
    };

    saveAndInitializeFirebaseConfig(payload);
    sessionStorage.removeItem('NUSANTARA_SESSION_ACTIVE');
    
    alert('SELAMAT! Aplikasi sekarang terhubung ke Project Firebase baru Anda. Halaman akan dimuat ulang dengan database baru.');
    
    cleanupMigrationApp();
    onMigrationComplete();
    window.location.reload();
  };

  // Revert back to original default Firebase config
  const handleResetToDefaultFirebase = () => {
    if (window.confirm('Apakah Anda yakin ingin mengembalikan koneksi database ke Firebase bawaan asli?')) {
      clearFirebaseConfig();
      alert('Koneksi berhasil dikembalikan ke Firebase bawaan asli. Aplikasi akan disegarkan.');
      window.location.reload();
    }
  };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 sm:p-5 print:hidden space-y-4">
      {/* HEADER CARD */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-200 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-amber-500 text-stone-950 rounded-xl shadow-3xs">
            <ArrowLeftRight size={20} />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-wider font-display flex items-center gap-2">
              Salin Data ke Akun / Project Firebase Lain
              {isCustomConfigActive && (
                <span className="text-[9px] font-mono normal-case bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 font-bold">
                  Kustom Aktif
                </span>
              )}
            </h4>
            <p className="text-[11px] text-stone-500 font-mono mt-0.5">
              Database Aktif: <strong className="text-stone-800 font-bold">{currentProjectId}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {isCustomConfigActive && (
            <button
              type="button"
              onClick={handleResetToDefaultFirebase}
              className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition flex items-center gap-1 cursor-pointer"
              title="Kembalikan ke database Firebase bawaan"
            >
              <RotateCcw size={13} />
              <span>Reset Default</span>
            </button>
          )}

          {!isModalDirect && (
            <button
              onClick={() => {
                setIsOpen(!isOpen);
                setCurrentStep(1);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                isOpen 
                  ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' 
                  : 'bg-[#D4AF37] text-stone-955 hover:bg-[#Bca031] font-semibold'
              }`}
            >
              {isOpen ? 'Tutup Panel' : 'Mulai Salin Data'}
            </button>
          )}

          {isModalDirect && onCloseModal && (
            <button
              onClick={onCloseModal}
              className="p-1.5 rounded-lg hover:bg-stone-200 text-stone-500 hover:text-stone-900 transition"
              title="Tutup"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {!isOpen && (
        <div className="space-y-2">
          <p className="text-xs text-stone-600 leading-relaxed">
            Fitur ini memungkinkan Anda <strong>menyalin seluruh data aplikasi</strong> (voucher kas/bank, profil instansi perusahaan, SPPD, master NPWP, pemetaan Accurate, dan absensi) secara instan ke akun atau project Firebase lain yang baru tanpa menghapus data di proyek saat ini.
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono text-stone-500">
            <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
              📁 {submissions.length} Transaksi
            </span>
            <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
              🏢 {counts.companies} Profil PT
            </span>
            <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
              ✈️ {counts.sppd} SPPD
            </span>
            <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
              📋 {counts.npwp} NPWP
            </span>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="border border-stone-200 bg-white rounded-2xl p-4 sm:p-5 space-y-5 animate-fade-in shadow-3xs">
          {/* STEPPER PROGRESS */}
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center">
            {([1, 2, 3, 4, 5] as const).map((step) => (
              <div key={step} className="space-y-1">
                <div className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentStep >= step ? 'bg-[#D4AF37]' : 'bg-stone-200'
                }`} />
                <span className={`block text-[9px] sm:text-[10px] font-bold tracking-tight ${
                  currentStep === step ? 'text-stone-900 font-mono font-extrabold' : 'text-stone-400'
                }`}>
                  T-0{step}
                </span>
              </div>
            ))}
          </div>

          <div className="text-stone-800 text-xs border-b border-stone-150 pb-2.5 flex items-center justify-between">
            <span className="font-extrabold text-stone-900 flex items-center gap-1.5">
              {currentStep === 1 && 'Tahap 1: Verifikasi & Pemilihan Koleksi Data'}
              {currentStep === 2 && 'Tahap 2: Input Kredensial Project Firebase Baru'}
              {currentStep === 3 && 'Tahap 3: Autentikasi / Izin Akses Database'}
              {currentStep === 4 && 'Tahap 4: Proses Salin Massal Seluruh Data'}
              {currentStep === 5 && 'Tahap 5: Selesai & Pemilihan Database Aktif'}
            </span>
            <span className="text-[10px] font-mono text-stone-600 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200 font-bold">
              Progress: {Math.round(((currentStep - 1) / 5) * 100)}%
            </span>
          </div>

          {/* ALERT MESSAGES */}
          {errorMsg && (
            <div className="space-y-3">
              <div className="p-3.5 bg-rose-50 border border-rose-250 rounded-xl text-xs text-rose-850 flex gap-2.5 items-start">
                <ServerCrash size={16} className="shrink-0 mt-0.5 text-rose-650" />
                <p className="leading-relaxed font-semibold">{errorMsg}</p>
              </div>

              {(errorMsg.toLowerCase().includes('permissions') || errorMsg.toLowerCase().includes('insufficient')) && (
                <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-xl space-y-3 text-xs text-stone-800">
                  <div className="flex gap-2 items-start">
                    <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h6 className="font-bold text-amber-950 uppercase tracking-wide">
                        💡 Solusi Cepat: Aturan Keamanan Database Target Masih Terkunci!
                      </h6>
                      <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                        Firebase baru secara default menolak proses tulis data. Silakan salin aturan mode terbuka di bawah, buka Firebase Console proyek baru Anda, masuk ke <strong>Firestore Database &gt; Rules</strong>, tempelkan aturan ini, lalu klik <strong>Publish</strong>:
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-white border border-amber-200 rounded-lg space-y-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const testRules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`;
                        navigator.clipboard.writeText(testRules);
                        alert('✓ Aturan Keamanan "Test Mode" disalin! Silakan tempelkan ke tab Rules di Firebase Console proyek baru Anda.');
                      }}
                      className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white font-mono font-bold text-[10px] rounded flex items-center justify-center gap-1.5 cursor-pointer transition shadow-3xs"
                    >
                      <Copy size={13} />
                      <span>Salin Aturan Keamanan Bebas (Open Mode)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-250 rounded-xl text-xs text-emerald-850 flex gap-2.5 items-start">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
              <p className="leading-relaxed font-semibold">{successMsg}</p>
            </div>
          )}

          {/* ================= STEP 1 ================= */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2.5 items-start bg-amber-50/70 p-3.5 border border-amber-200 rounded-xl text-xs text-amber-950">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">INFORMASI PENYALINAN DATA ANTAR FIREBASE:</p>
                  <p className="text-stone-700 leading-relaxed">
                    Sistem ini akan menduplikasi data dari database aktif saat ini (<code className="font-mono text-amber-900 bg-amber-100 px-1 rounded">{currentProjectId}</code>) ke akun / proyek Firebase baru Anda secara aman tanpa menghapus data asli.
                  </p>
                </div>
              </div>

              {/* COLLECTION CHECKLIST */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-stone-800 uppercase tracking-wider font-display">
                    PILIH DATA YANG AKAN DISALIN KE FIREBASE BARU:
                  </p>
                  <span className="text-[10px] font-mono text-stone-500">
                    Semua data terpilih default
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {/* Submissions */}
                  <label className="flex items-center gap-2.5 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="checkbox"
                      checked={includeOptions.submissions}
                      onChange={(e) => setIncludeOptions({ ...includeOptions, submissions: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-stone-800 block">Voucher BKK / BKM</span>
                      <span className="text-[10px] text-stone-500 font-mono">{submissions.length} transaksi dokumen</span>
                    </div>
                  </label>

                  {/* Companies */}
                  <label className="flex items-center gap-2.5 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="checkbox"
                      checked={includeOptions.companies}
                      onChange={(e) => setIncludeOptions({ ...includeOptions, companies: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-stone-800 block">Profil Instansi Perusahaan</span>
                      <span className="text-[10px] text-stone-500 font-mono">{counts.companies} profil PT (Multi-PT)</span>
                    </div>
                  </label>

                  {/* NPWP */}
                  <label className="flex items-center gap-2.5 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="checkbox"
                      checked={includeOptions.npwp}
                      onChange={(e) => setIncludeOptions({ ...includeOptions, npwp: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-stone-800 block">Master NPWP &amp; Vendor</span>
                      <span className="text-[10px] text-stone-500 font-mono">{counts.npwp} data wajib pajak</span>
                    </div>
                  </label>

                  {/* SPPD */}
                  <label className="flex items-center gap-2.5 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="checkbox"
                      checked={includeOptions.sppd}
                      onChange={(e) => setIncludeOptions({ ...includeOptions, sppd: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-stone-800 block">Formulir SPPD Dinas</span>
                      <span className="text-[10px] text-stone-500 font-mono">{counts.sppd} lembar tugas</span>
                    </div>
                  </label>

                  {/* Accurate */}
                  <label className="flex items-center gap-2.5 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="checkbox"
                      checked={includeOptions.accurate}
                      onChange={(e) => setIncludeOptions({ ...includeOptions, accurate: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-stone-800 block">Pemetaan Akun Accurate</span>
                      <span className="text-[10px] text-stone-500 font-mono">{counts.accurate} pemetaan akun</span>
                    </div>
                  </label>

                  {/* Absen */}
                  <label className="flex items-center gap-2.5 p-2.5 bg-white border border-stone-200 rounded-xl cursor-pointer hover:border-amber-400 transition">
                    <input
                      type="checkbox"
                      checked={includeOptions.absen}
                      onChange={(e) => setIncludeOptions({ ...includeOptions, absen: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-stone-800 block">Rekap Absensi Karyawan</span>
                      <span className="text-[10px] text-stone-500 font-mono">{counts.absen} data absensi</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* OFFLINE BACKUP OPTION */}
              <div className="p-4 bg-amber-50/50 border border-amber-250 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-bold text-amber-950 flex items-center gap-1.5 font-display">
                    <Download size={14} className="text-amber-700" />
                    Unduh Arsip Cadangan Lengkap (.JSON)
                  </h5>
                  <p className="text-[11px] text-stone-600 mt-0.5">
                    Simpan file cadangan seluruh database saat ini ke komputer Anda sebagai antisipasi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadFullBackup}
                  disabled={isExportingJson}
                  className="px-3.5 py-2 text-xs font-bold text-stone-900 bg-white hover:bg-amber-100 border border-amber-300 rounded-xl transition flex items-center gap-1.5 shadow-3xs cursor-pointer shrink-0"
                >
                  <Download size={13} className={isExportingJson ? 'animate-bounce' : ''} />
                  <span>{isExportingJson ? 'Mengemas File...' : 'Download Backup (.JSON)'}</span>
                </button>
              </div>

              {/* ACTION FOOTER */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2.5 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition flex items-center gap-2 shadow-3xs cursor-pointer"
                >
                  <span>Lanjut: Masukkan Firebase Baru</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 2 ================= */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex gap-2.5 items-start text-stone-600 text-xs bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <ShieldCheck size={16} className="text-[#D4AF37] shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Buka <strong>Firebase Console</strong> proyek baru Anda (di <strong>Project settings &gt; General &gt; Your apps &gt; SDK setup and configuration</strong>). Tempelkan kode SDK di kotak otomatis di bawah untuk pengisian kilat!
                </p>
              </div>

              {/* AUTOMATED SDK PASTE PORTAL */}
              <div className="bg-amber-50/40 border border-amber-250 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-mono font-bold text-amber-900 uppercase tracking-wider">
                    📋 Tempel Kode SDK Firebase (Otomatis &amp; Cepat)
                  </label>
                  <span className="text-[9px] text-stone-500 italic bg-white px-2 py-0.5 rounded border border-stone-200">
                    Mendukung format JS, JSON &amp; Config object
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={rawSdkCode}
                  onChange={(e) => parseFirebaseConfigFromCode(e.target.value)}
                  placeholder={`// Silakan tempelkan code SDK Firebase di sini, contoh:\nconst firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "proyek-baru.firebaseapp.com",\n  projectId: "proyek-baru",\n  storageBucket: "proyek-baru.firebasestorage.app",\n  messagingSenderId: "123456789",\n  appId: "1:123456789:web:abcdef"\n};`}
                  className="w-full p-2.5 bg-white border border-stone-250 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-850"
                />
              </div>

              <div className="text-stone-400 text-[10px] font-mono uppercase tracking-widest border-b border-stone-150 pb-1 flex items-center justify-between">
                <span>FORM PARAMETER MANUAL</span>
                <span 
                  className="text-stone-500 hover:text-stone-800 cursor-pointer text-[10px] underline font-sans font-bold"
                  onClick={() => {
                    setTargetApiKey('');
                    setTargetProjectId('');
                    setTargetAuthDomain('');
                    setTargetStorageBucket('');
                    setTargetMessagingSenderId('');
                    setTargetAppId('');
                    setRawSdkCode('');
                  }}
                >
                  Kosongkan Form
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    API KEY BARU *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetApiKey}
                    onChange={(e) => setTargetApiKey(e.target.value)}
                    placeholder="AIzaSyA..."
                    className="w-full p-2.5 bg-white border border-stone-250 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    PROJECT ID BARU *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    placeholder="proyek-firebase-baru"
                    className="w-full p-2.5 bg-white border border-stone-250 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    AUTH DOMAIN
                  </label>
                  <input
                    type="text"
                    value={targetAuthDomain}
                    onChange={(e) => setTargetAuthDomain(e.target.value)}
                    placeholder="proyek-firebase-baru.firebaseapp.com"
                    className="w-full p-2.5 bg-white border border-stone-250 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                    APP ID BARU *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetAppId}
                    onChange={(e) => setTargetAppId(e.target.value)}
                    placeholder="1:123456789:web:abcdef..."
                    className="w-full p-2.5 bg-white border border-stone-250 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-stone-150">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition"
                >
                  Kembali
                </button>
                <button
                  onClick={handleTestTargetConnection}
                  disabled={isLoading}
                  className="px-5 py-2 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition flex items-center gap-1.5 shadow-3xs cursor-pointer"
                >
                  <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                  <span>{isLoading ? 'Menghubungkan...' : 'Hubungkan Project & Lanjut'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 3 ================= */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex gap-2.5 items-start">
                  <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-extrabold text-amber-950 uppercase tracking-wide">
                      PILIHAN METODE AKSES KE FIREBASE BARU:
                    </p>
                    <p className="text-stone-700 leading-relaxed">
                      Anda bisa langsung menyalin data tanpa mendaftar akun dengan menekan tombol <strong>"Lewati Otentikasi (Bypass)"</strong>, ATAU mendaftarkan akun baru ke Firebase Auth proyek baru Anda.
                    </p>
                  </div>
                </div>
              </div>

              {/* FORM DATA PENGGUNA */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
                <p className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-widest">
                  Identitas Pengguna Pada Database Baru:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Email Akun Target *
                    </label>
                    <input
                      type="email"
                      required
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                      placeholder="admin@perusahaandrive.com"
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Password Akun (Jika Daftar)
                    </label>
                    <input
                      type="password"
                      value={targetPassword}
                      onChange={(e) => setTargetPassword(e.target.value)}
                      placeholder="Minimal 6 Karakter"
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Nama Lengkap Penanggung Jawab
                    </label>
                    <input
                      type="text"
                      value={targetFullName}
                      onChange={(e) => setTargetFullName(e.target.value)}
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider mb-1">
                      Kode Perusahaan Aktif
                    </label>
                    <input
                      type="text"
                      value={targetCompanyId}
                      onChange={(e) => setTargetCompanyId(e.target.value.toLowerCase().trim())}
                      className="w-full p-2 bg-white border border-stone-250 rounded-lg text-xs font-mono text-stone-800"
                    />
                  </div>
                </div>
              </div>

              {/* BYPASS SHORTCUT */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-250 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    ⚡ Rekomendasi Tercepat (Tanpa Setup Auth)
                  </span>
                  <span className="text-[9px] font-mono bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-bold">
                    Paling Mudah
                  </span>
                </div>
                <p className="text-[11px] text-stone-600">
                  Data akan langsung ditransfer ke koleksi Firestore proyek target Anda tanpa perlu mengonfigurasi email provider di Firebase Console.
                </p>
                <button
                  type="button"
                  onClick={handleBypassAuthentication}
                  className="w-full py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs"
                >
                  <span>⚡ Lewati Otentikasi &amp; Lanjut Transfer Data</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center pt-2 gap-3 border-t border-stone-150">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition"
                >
                  Kembali
                </button>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handleTargetAuthentication('signin')}
                    disabled={isLoading}
                    className="px-3 py-2 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <LogIn size={13} />
                    Gunakan Akun Login
                  </button>
                  <button
                    onClick={() => handleTargetAuthentication('signup')}
                    disabled={isLoading}
                    className="px-4 py-2 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition flex items-center gap-1.5 shadow-3xs cursor-pointer"
                  >
                    <UserPlus size={14} />
                    Daftar Akun Baru
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 4 ================= */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
                <h5 className="text-xs font-bold text-stone-800 uppercase tracking-wide font-display">
                  RINGKASAN PROSES SALIN DATA KE PROYEK TARGET:
                </h5>
                <ul className="text-xs text-stone-650 space-y-1.5 list-disc list-inside">
                  <li>Target Proyek ID: <strong className="text-stone-900 font-mono">{targetProjectId}</strong></li>
                  <li>Profil Admin Target: <strong className="text-stone-900 font-mono">{targetUser?.email}</strong></li>
                  <li>Total voucher yang akan disalin: <strong className="text-amber-800 font-bold">{submissions.length} transaksi</strong></li>
                  <li>Profil perusahaan, SPPD, NPWP, pemetaan Accurate &amp; absensi akan disalin sesuai pilihan Anda.</li>
                </ul>

                {isLoading && (
                  <div className="space-y-2 pt-2 animate-pulse">
                    <div className="flex justify-between text-xs font-semibold text-stone-700">
                      <span>Sedang Mentransfer Data ke Cloud Baru...</span>
                      <span>{migrationProgress}%</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full transition-all duration-300"
                        style={{ width: `${migrationProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* LIVE CONSOLE LOGS */}
              {migrationLogs.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-3.5 text-[10px] font-mono text-emerald-400 h-36 overflow-y-auto space-y-1 scrollbar-thin">
                  {migrationLogs.map((log, index) => (
                    <div key={index} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center pt-1 border-t border-stone-150">
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition"
                >
                  Kembali
                </button>
                <button
                  onClick={handleRunMassMigration}
                  disabled={isLoading}
                  className="px-5 py-2.5 text-xs font-bold bg-[#D4AF37] hover:bg-[#Bca031] text-stone-955 rounded-xl transition flex items-center gap-2 shadow-3xs cursor-pointer font-semibold"
                >
                  <Database size={15} />
                  <span>{isLoading ? 'Sedang Menyalin...' : 'Mulai Salin Semua Data Sekarang'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 5 ================= */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-fade-in text-left">
              <div className="text-center p-5 space-y-2.5 bg-emerald-50 border border-emerald-250 rounded-2xl">
                <div className="inline-flex p-3 bg-emerald-100 text-emerald-700 rounded-full">
                  <CheckCircle2 size={32} />
                </div>
                <div className="space-y-1">
                  <h5 className="text-sm font-bold text-emerald-950 font-display">
                    SELURUH DATA TELAH SUKSES TERSALIN KE PROYEK BARU!
                  </h5>
                  <p className="text-xs text-emerald-800 leading-relaxed max-w-lg mx-auto">
                    Data transaksi, profil perusahaan, SPPD, NPWP, Accurate, dan akun telah berhasil diduplikasi ke Firebase Project ID: <code className="font-mono font-bold bg-emerald-100 px-1 rounded">{targetProjectId}</code>.
                  </p>
                </div>
              </div>

              {/* FIRESTORE RULES SYNCRONIZATION INFO BOX */}
              <div className="bg-amber-50/75 border border-amber-250 rounded-2xl p-4 space-y-3">
                <div className="flex gap-2 items-start">
                  <Sparkles size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h6 className="text-xs font-bold text-amber-950 uppercase tracking-wider font-display">
                      Aturan Keamanan (Firestore Rules) di Proyek Baru
                    </h6>
                    <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                      Agar aplikasi di proyek baru Anda bisa membaca dan menulis data selamanya tanpa pesan peringatan kedaluwarsa 30 hari, salin aturan keamanan berikut ke tab <strong>Rules</strong> di Firebase Console proyek baru Anda:
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                  <button
                    onClick={() => {
                      const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;
                      navigator.clipboard.writeText(rules);
                      alert('✓ Aturan Keamanan Berhasil Disalin! Buka tab Rules di Firestore Console proyek baru Anda dan klik Publish.');
                    }}
                    className="px-3.5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-mono font-bold w-full transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                  >
                    <Copy size={14} />
                    <span>Salin Aturan Firestore Permanen (Open Mode)</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-2 text-stone-700">
                <p className="font-bold text-stone-900">LANGKAH SELANJUTNYA:</p>
                <p className="leading-relaxed">
                  Pilih opsi di bawah apakah Anda ingin langsung mengalihkan aplikasi ini ke proyek Firebase baru, atau hanya membiarkan datanya tersimpan di proyek baru sementara aplikasi tetap terhubung ke database saat ini.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 border-t border-stone-150">
                <button
                  type="button"
                  onClick={() => {
                    alert('Data telah tersalin dengan aman di proyek baru Anda. Aplikasi tetap menggunakan proyek aktif saat ini.');
                    if (onCloseModal) onCloseModal();
                    setIsOpen(false);
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition cursor-pointer"
                >
                  Selesai (Tetap di Firebase Saat Ini)
                </button>
                
                <button
                  type="button"
                  onClick={handlePromoteAndFinalize}
                  className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm font-semibold cursor-pointer"
                >
                  <Check size={16} />
                  <span>Jadikan Database Utama &amp; Refresh Aplikasi</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

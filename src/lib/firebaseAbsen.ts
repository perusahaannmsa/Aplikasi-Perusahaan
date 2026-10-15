import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from "firebase/auth";
import { ensureValidDriveToken, setGoogleDriveToken, getStoredGoogleDriveToken, getActiveGoogleDriveAccount, getOrRenewDriveToken } from "../firebase";
import firebaseAppletConfig from "../../firebase-applet-config.json";

// Initialize Firebase with unified applet credentials & target database
const app = getApps().find(a => a.name === "[DEFAULT]") || initializeApp(firebaseAppletConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseAppletConfig.firestoreDatabaseId || "(default)");

// Setup Google Auth Provider
export const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.addScope("https://www.googleapis.com/auth/spreadsheets");

// Flag to track signing in
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const saveGoogleToken = (token: string, email?: string) => {
  cachedAccessToken = token;
  localStorage.setItem("g_access_token", token);
  localStorage.setItem("g_access_token_time", Date.now().toString());
  setGoogleDriveToken(token);
  if (email) {
    localStorage.setItem("g_user_email", email);
  }
};

export const getFreshGoogleToken = async (forceRefresh = false): Promise<string> => {
  // 1. Try unified system drive token first to ensure identical Google Drive account
  try {
    const activeAccount = getActiveGoogleDriveAccount();
    const emailToUse = activeAccount?.email || localStorage.getItem("g_user_email") || undefined;
    
    // Proactively get or renew drive token
    const unifiedToken = await getOrRenewDriveToken(emailToUse, forceRefresh);
    if (unifiedToken) {
      cachedAccessToken = unifiedToken;
      localStorage.setItem("g_access_token", unifiedToken);
      localStorage.setItem("g_access_token_time", Date.now().toString());
      return unifiedToken;
    }
  } catch (err) {
    console.warn("Notice: unified drive token resolution fallback in absen:", err);
  }

  const currentToken = localStorage.getItem("g_access_token") || getStoredGoogleDriveToken(!forceRefresh);
  const tokenTimeStr = localStorage.getItem("g_access_token_time");
  const tokenAgeMs = tokenTimeStr ? Date.now() - parseInt(tokenTimeStr, 10) : Infinity;

  // Sandbox token bypass
  if (currentToken === "ACCESSTOKEN_SANDBOX_ACTIVE") {
    return currentToken;
  }

  // If token is less than 45 minutes old and forceRefresh is false, return active token
  if (currentToken && tokenAgeMs < 45 * 60 * 1000 && !forceRefresh) {
    return currentToken;
  }

  // Attempt interactive renewal if token is old or forceRefresh
  try {
    const activeAccount = getActiveGoogleDriveAccount();
    const emailToUse = activeAccount?.email || localStorage.getItem("g_user_email") || undefined;
    const renewed = await getOrRenewDriveToken(emailToUse, true);
    if (renewed) {
      cachedAccessToken = renewed;
      localStorage.setItem("g_access_token", renewed);
      localStorage.setItem("g_access_token_time", Date.now().toString());
      return renewed;
    }
  } catch (err) {
    console.warn("Failed interactive renewal in getFreshGoogleToken:", err);
  }

  if (currentToken && !forceRefresh) {
    return currentToken;
  }

  if (currentToken) return currentToken;
  throw new Error("TOKEN_EXPIRED_401: Sesi Google Drive kedaluwarsa. Silakan sambungkan ulang akun Google Anda.");
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const persistedToken = localStorage.getItem("g_access_token");
      if (persistedToken) {
        cachedAccessToken = persistedToken;
        if (onAuthSuccess) onAuthSuccess(user, persistedToken);
      } else if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem("g_access_token");
      localStorage.removeItem("g_access_token_time");
      localStorage.removeItem("g_user_email");
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (forceSelectAccount = false): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) {
    console.warn("Proses login Google sedang berjalan...");
    return null;
  }
  try {
    isSigningIn = true;
    const savedEmail = localStorage.getItem("g_user_email");
    if (forceSelectAccount) {
      provider.setCustomParameters({ prompt: "select_account" });
    } else if (savedEmail) {
      provider.setCustomParameters({ login_hint: savedEmail });
    } else {
      provider.setCustomParameters({ prompt: "select_account" });
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Gagal memperoleh Google Access Token dari autentikasi.");
    }
    saveGoogleToken(credential.accessToken, result.user.email || undefined);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error("Firebase Sign In with Google failed:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const cleanDataForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanDataForFirestore);
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = cleanDataForFirestore(val);
      }
    }
    return cleaned;
  }
  return obj;
};

export const googleSignOut = async (): Promise<void> => {
  try {
    await signOut(auth);
    cachedAccessToken = null;
    localStorage.removeItem("g_access_token");
    localStorage.removeItem("g_access_token_time");
    localStorage.removeItem("g_user_email");
  } catch (error) {
    console.error("Sign out failed:", error);
    throw error;
  }
};

let lastFirestorePermissionDeniedTime = 0;

// Direct, instant sync to Cloud Firebase Firestore for attendance
export const saveAttendanceToFirestore = async (
  records: any[],
  workersList: any[],
  weeklyReportsList?: any[]
): Promise<boolean> => {
  // If remote Firestore rules recently rejected writes, avoid spamming RPC streams
  if (Date.now() - lastFirestorePermissionDeniedTime < 180000) {
    return false;
  }

  try {
    const timestamp = new Date().toISOString();

    // Clean records so that ONLY active/truthy attendance dates exist
    // ("jika ada absen tulis jika tidak ada hapus di firebase")
    const cleanedRecords = (records || []).map((r) => {
      const cleanAtt: Record<string, boolean> = {};
      if (r && r.attendance) {
        Object.entries(r.attendance).forEach(([d, val]) => {
          if (val === true) {
            cleanAtt[d] = true;
          }
        });
      }
      const cleanCustom: Record<string, string> = {};
      if (r && r.customStatus) {
        Object.entries(r.customStatus).forEach(([d, val]) => {
          if (val) cleanCustom[d] = val as string;
        });
      }
      const cleanReasons: Record<string, string> = {};
      if (r && r.reasons) {
        Object.entries(r.reasons).forEach(([d, val]) => {
          if (val) cleanReasons[d] = val as string;
        });
      }
      return {
        ...r,
        attendance: cleanAtt,
        customStatus: cleanCustom,
        reasons: cleanReasons,
      };
    });

    const cleanWeeklyReports = cleanDataForFirestore(weeklyReportsList || []);

    await setDoc(doc(db, "attendance", "current_records"), {
      attendanceRecords: cleanDataForFirestore(cleanedRecords),
      workers: cleanDataForFirestore(workersList),
      weeklyReports: cleanWeeklyReports,
      updatedAt: timestamp,
      totalWorkers: (workersList || []).length,
      totalRecords: (cleanedRecords || []).length,
      totalReports: cleanWeeklyReports.length
    }, { merge: true });

    // Also store individual reports under attendance collection where permissions are active
    if (cleanWeeklyReports.length > 0) {
      for (const rep of cleanWeeklyReports) {
        if (!rep) continue;
        const repId = rep.id || `rep_${rep.weekStartDate || Date.now()}`;
        try {
          await setDoc(doc(db, "attendance", `rep_${repId}`), {
            ...rep,
            syncedAt: timestamp
          }, { merge: true });
        } catch (_) {}
      }
    }
    return true;

  } catch (err: any) {
    const isPermissionDenied = err?.code === 'permission-denied' || String(err?.message).includes('PERMISSION_DENIED');
    if (isPermissionDenied) {
      lastFirestorePermissionDeniedTime = Date.now();
      console.warn("⚠️ [Firestore Attendance] Izin tulis ditolak (PERMISSION_DENIED). Menggunakan penyimpanan lokal & server sementara.");
    } else {
      console.warn("Notice: Failed to save attendance directly to Firestore:", err?.message);
    }
    return false;
  }
};

// Direct load/restore from Cloud Firebase Firestore
export const loadAttendanceFromFirestore = async (): Promise<{
  attendanceRecords: any[];
  workers: any[];
  weeklyReports: any[];
  latestActiveDate?: string | null;
} | null> => {
  try {
    const masterDoc = await getDoc(doc(db, "attendance", "current_records"));
    let wrks: any[] = [];
    const workerMap = new Map<string, any>();
    const repMap = new Map<string, any>();

    // 1. Load from master document if present
    if (masterDoc.exists()) {
      const data = masterDoc.data();
      wrks = data.workers || [];

      // A. Master attendance records snapshot
      if (Array.isArray(data.attendanceRecords)) {
        data.attendanceRecords.forEach((r: any) => {
          if (!r || !r.workerId) return;
          const cleanAtt: Record<string, boolean> = {};
          if (r.attendance) {
            Object.entries(r.attendance).forEach(([d, val]) => {
              if (val === true) cleanAtt[d] = true;
            });
          }
          workerMap.set(r.workerId, {
            workerId: r.workerId,
            dailyAllowance: r.dailyAllowance || 25000,
            attendance: cleanAtt,
            customStatus: { ...(r.customStatus || {}) },
            reasons: { ...(r.reasons || {}) },
            signatures: { ...(r.signatures || {}) }
          });
        });
      }

      // B. Merge all attendance records contained inside all weeklyReports!
      if (Array.isArray(data.weeklyReports)) {
        data.weeklyReports.forEach((rep: any) => {
          if (!rep) return;
          const repKey = rep.id || `${rep.weekStartDate}_${rep.weekEndDate}`;
          repMap.set(repKey, rep);

          if (Array.isArray(rep.records)) {
            rep.records.forEach((rec: any) => {
              if (!rec || !rec.workerId) return;
              const existing = workerMap.get(rec.workerId) || {
                workerId: rec.workerId,
                dailyAllowance: rec.dailyAllowance || 25000,
                attendance: {},
                customStatus: {},
                reasons: {},
                signatures: {}
              };

              if (rec.attendance) {
                Object.entries(rec.attendance).forEach(([d, val]) => {
                  if (val === true) existing.attendance[d] = true;
                });
              }
              if (rec.customStatus) {
                Object.entries(rec.customStatus).forEach(([d, val]) => {
                  if (val) existing.customStatus[d] = val;
                });
              }
              if (rec.reasons) {
                Object.entries(rec.reasons).forEach(([d, val]) => {
                  if (val) existing.reasons[d] = val;
                });
              }
              workerMap.set(rec.workerId, existing);
            });
          }
        });
      }
    }

    // 2. Also check absen_records collection for individual clock-ins / live check-ins
    try {
      const snap = await getDocs(collection(db, "absen_records"));
      if (!snap.empty) {
        snap.forEach((d) => {
          const ab = d.data();
          if (!ab || !ab.workerId || !ab.date) return;
          const existing = workerMap.get(ab.workerId) || {
            workerId: ab.workerId,
            dailyAllowance: 25000,
            attendance: {},
            customStatus: {},
            reasons: {},
            signatures: {}
          };
          if (ab.status === "Hadir" || ab.status === true) {
            existing.attendance[ab.date] = true;
          } else if (ab.status && ab.status !== "Absen") {
            existing.customStatus[ab.date] = ab.status;
            if (ab.reason) existing.reasons[ab.date] = ab.reason;
          }
          if (ab.signature) {
            existing.signatures[ab.date] = ab.signature;
          }
          workerMap.set(ab.workerId, existing);
        });
      }
    } catch (fbErr) {
      console.warn("Fallback absen_records notice:", fbErr);
    }

    // 3. Find latestActiveDate across all consolidated attendance records
    let latestActiveDate: string | null = null;
    workerMap.forEach((rec) => {
      if (rec.attendance) {
        Object.entries(rec.attendance).forEach(([d, v]) => {
          if (v === true) {
            if (!latestActiveDate || d > latestActiveDate) {
              latestActiveDate = d;
            }
          }
        });
      }
    });

    const consolidatedRecords = Array.from(workerMap.values());
    console.log(`[Firebase] Consolidated ${consolidatedRecords.length} workers with total attendance history. Latest active date: ${latestActiveDate}`);

    return {
      attendanceRecords: consolidatedRecords,
      workers: wrks,
      weeklyReports: Array.from(repMap.values()),
      latestActiveDate
    };
  } catch (err: any) {
    console.warn("Notice: Failed to load attendance from Firestore:", err?.message);
    return null;
  }
};



import { doc, setDoc, getDoc, collection, getDocs, onSnapshot, disableNetwork, deleteDoc } from "firebase/firestore";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from "firebase/auth";
import { 
  ensureValidDriveToken, 
  setGoogleDriveToken, 
  getStoredGoogleDriveToken, 
  getActiveGoogleDriveAccount, 
  getOrRenewDriveToken, 
  isFirestoreQuotaExceeded, 
  markFirestoreQuotaExceeded, 
  registerFirestoreInstance,
  loadWorkersFromFirestore,
  saveWorkerToFirestore,
  deleteWorkerFromFirestore,
  saveWorkersListToFirestore,
  subscribeToWorkersMasterFromFirestore,
  mergeWorkerListsSafely,
  getDeletedWorkerIds,
  saveDeletedWorkerIds,
  recordFirestoreWrites,
  recordFirestoreReads,
  getSharedFirestoreDb,
  getSharedFirebaseAuth,
  getIsolatedDriveAuth,
  googleDriveLogin,
  getMasterDriveEmail,
  LOCKED_MASTER_DRIVE_EMAIL,
  withTimeout,
  isFirestorePermissionError,
  isFirestorePermissionDenied,
  markFirestorePermissionDenied,
  isFirestoreInternalAssertionError,
  isFirestoreInternalDegraded,
  markFirestoreInternalAssertion
} from "../firebase";

export {
  loadWorkersFromFirestore,
  saveWorkerToFirestore,
  deleteWorkerFromFirestore,
  saveWorkersListToFirestore,
  subscribeToWorkersMasterFromFirestore,
  mergeWorkerListsSafely,
  getDeletedWorkerIds,
  saveDeletedWorkerIds
};

// Reuse unified initialized Auth & Firestore instances from ../firebase (with memoryLocalCache + long polling auto-detect)
export const auth = getSharedFirebaseAuth()!;
export const db = getSharedFirestoreDb()!;
registerFirestoreInstance(db);

export const hasAbsenAuthUser = (): boolean => {
  try {
    const activeAuth = getSharedFirebaseAuth() || auth;
    return Boolean(activeAuth?.currentUser);
  } catch {
    return false;
  }
};

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
  // 1. Always target the active Master Drive account (never the Firebase/Firestore login account)
  const emailToUse = getMasterDriveEmail() || LOCKED_MASTER_DRIVE_EMAIL;
  try {
    const unifiedToken = await getOrRenewDriveToken(emailToUse, forceRefresh);
    if (unifiedToken) {
      cachedAccessToken = unifiedToken;
      localStorage.setItem("g_access_token", unifiedToken);
      localStorage.setItem("g_access_token_time", Date.now().toString());
      return unifiedToken;
    }
  } catch (err) {
    if (forceRefresh) {
      throw err;
    }
    console.warn("Notice: unified drive token resolution fallback in absen:", err);
  }

  const storedUnifiedToken = getStoredGoogleDriveToken(true);
  if (storedUnifiedToken && !forceRefresh) {
    cachedAccessToken = storedUnifiedToken;
    return storedUnifiedToken;
  }

  // Attempt interactive renewal if token is old or forceRefresh
  try {
    const renewed = await getOrRenewDriveToken(emailToUse, true);
    if (renewed) {
      cachedAccessToken = renewed;
      localStorage.setItem("g_access_token", renewed);
      localStorage.setItem("g_access_token_time", Date.now().toString());
      return renewed;
    }
  } catch (err) {
    console.warn("Failed interactive renewal in getFreshGoogleToken:", err);
    throw err;
  }

  throw new Error("TOKEN_EXPIRED_401: Sesi Google Drive kedaluwarsa. Silakan sambungkan ulang akun Google Drive resmi.");
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Immediately hydrate from unified Google Drive token store (independent of primary Firebase Auth)
  const existingDriveToken = getStoredGoogleDriveToken(true);
  if (existingDriveToken) {
    cachedAccessToken = existingDriveToken;
    const driveUser = ({
      email: getActiveGoogleDriveAccount()?.email || LOCKED_MASTER_DRIVE_EMAIL,
    } as unknown) as User;
    if (onAuthSuccess) onAuthSuccess(driveUser, existingDriveToken);
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    // NEVER wipe Google Drive token when primary Firebase Auth changes; Drive uses its own isolated OAuth session.
    const driveToken = getStoredGoogleDriveToken(true) || cachedAccessToken;
    if (driveToken) {
      cachedAccessToken = driveToken;
      const driveUser = ({
        ...(user || {}),
        email: getActiveGoogleDriveAccount()?.email || LOCKED_MASTER_DRIVE_EMAIL,
      } as unknown) as User;
      if (onAuthSuccess) onAuthSuccess(driveUser, driveToken);
    } else if (!isSigningIn) {
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
    const targetDrive = getMasterDriveEmail() || LOCKED_MASTER_DRIVE_EMAIL;
    const result = await googleDriveLogin(targetDrive, forceSelectAccount, [
      "https://www.googleapis.com/auth/spreadsheets"
    ]);
    if (!result?.accessToken) {
      throw new Error("Gagal memperoleh Google Access Token dari autentikasi.");
    }
    saveGoogleToken(result.accessToken, result.driveDetails?.email || targetDrive);
    return { user: result.user, accessToken: result.accessToken };
  } catch (error: any) {
    console.error("Google Drive Sign In failed:", error);
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
    const driveAuth = getIsolatedDriveAuth();
    await signOut(driveAuth).catch(() => {});
    cachedAccessToken = null;
    localStorage.removeItem("g_access_token");
    localStorage.removeItem("g_access_token_time");
    localStorage.removeItem("NUSANTARA_GOOGLE_DRIVE_TOKEN");
  } catch (error) {
    console.error("Sign out Drive failed:", error);
    throw error;
  }
};

let lastFirestorePermissionDeniedTime = 0;
const CLIENT_ATTENDANCE_SESSION_ID = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
let lastLocalAttendanceWriteAt = 0;

export const getLastLocalAttendanceWriteAt = () => lastLocalAttendanceWriteAt;

// Silently remove obsolete absen_records entry when admin explicitly unchecks/resets a cell
export const clearLegacyAbsenRecordsForDates = async (
  edits: Array<{ workerId: string; date: string }>
): Promise<void> => {
  const activeDb = getSharedFirestoreDb() || db;
  if (
    !activeDb ||
    !hasAbsenAuthUser() ||
    isFirestoreQuotaExceeded() ||
    isFirestorePermissionDenied() ||
    isFirestoreInternalDegraded() ||
    !Array.isArray(edits) ||
    edits.length === 0
  ) {
    return;
  }
  const uniquePairs = edits.slice(0, 40);
  await Promise.all(
    uniquePairs.map(async ({ workerId, date }) => {
      if (!workerId || !date) return;
      try {
        await deleteDoc(doc(activeDb, "absen_records", `absen_${workerId}_${date}`));
      } catch (_) {
        // Ignore if doc does not exist or rules restrict delete
      }
    })
  );
};

// Direct, instant sync to Cloud Firebase Firestore for attendance
export const saveAttendanceToFirestore = async (
  records: any[],
  workersList: any[],
  weeklyReportsList?: any[]
): Promise<boolean> => {
  const activeDb = getSharedFirestoreDb() || db;
  if (
    !activeDb ||
    !hasAbsenAuthUser() ||
    isFirestoreQuotaExceeded() ||
    isFirestorePermissionDenied() ||
    isFirestoreInternalDegraded()
  ) {
    return false;
  }

  // If remote Firestore rules recently rejected writes, avoid spamming RPC streams
  if (Date.now() - lastFirestorePermissionDeniedTime < 180000) {
    return false;
  }

  try {
    const nowMs = Date.now();
    lastLocalAttendanceWriteAt = nowMs;
    const timestamp = new Date(nowMs).toISOString();

    // Clean records so that ONLY active/truthy attendance dates exist
    // while preserving dateUpdatedAt timestamps so unchecks stay authoritative
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
      const cleanDateUpdatedAt: Record<string, number> = {};
      if (r && r.dateUpdatedAt && typeof r.dateUpdatedAt === 'object') {
        Object.entries(r.dateUpdatedAt).forEach(([d, ts]) => {
          const numTs = Number(ts);
          if (!isNaN(numTs) && numTs > 0) cleanDateUpdatedAt[d] = numTs;
        });
      }
      return {
        ...r,
        attendance: cleanAtt,
        customStatus: cleanCustom,
        reasons: cleanReasons,
        dateUpdatedAt: cleanDateUpdatedAt,
      };
    });

    const payload: Record<string, any> = {
      attendanceRecords: cleanDataForFirestore(cleanedRecords),
      workers: cleanDataForFirestore(workersList),
      updatedAt: timestamp,
      clientWriteId: CLIENT_ATTENDANCE_SESSION_ID,
      clientUpdatedAt: nowMs,
      totalWorkers: (workersList || []).length,
      totalRecords: (cleanedRecords || []).length,
    };

    if (weeklyReportsList !== undefined) {
      const cleanWeeklyReports = cleanDataForFirestore(weeklyReportsList || []);
      payload.weeklyReports = cleanWeeklyReports;
      payload.totalReports = cleanWeeklyReports.length;
    }

    await withTimeout(
      setDoc(doc(activeDb, "attendance", "current_records"), payload, { merge: true }),
      10000,
      'Simpan absensi ke Firestore'
    );

    recordFirestoreWrites(1);
    return true;

  } catch (err: any) {
    markFirestoreQuotaExceeded(err);
    markFirestorePermissionDenied(err);
    markFirestoreInternalAssertion(err);
    const errStr = String(err?.message || err?.code || err || '');
    const isPermissionDenied = isFirestorePermissionError(err);
    const isQuotaExceeded = err?.code === 'resource-exhausted' || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded');

    if (isQuotaExceeded) {
      lastFirestorePermissionDeniedTime = Date.now() + 60 * 60 * 1000 - 180000; // 60 min cooldown
      console.warn("⚠️ [Firestore Attendance] Kuota harian gratis Firestore telah tercapai (RESOURCE_EXHAUSTED). Menggunakan penyimpanan lokal & server.");
    } else if (isPermissionDenied) {
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
  const activeDb = getSharedFirestoreDb() || db;
  if (
    !activeDb ||
    !hasAbsenAuthUser() ||
    isFirestoreQuotaExceeded() ||
    isFirestorePermissionDenied() ||
    isFirestoreInternalDegraded()
  ) {
    return null;
  }
  try {
    const masterDoc = await withTimeout(getDoc(doc(activeDb, "attendance", "current_records")), 10000, 'Memuat absensi');
    const workersMasterDoc = await withTimeout(getDoc(doc(activeDb, "attendance", "workers_master")), 6000, 'Memuat master karyawan').catch(() => null);
    recordFirestoreReads(workersMasterDoc ? 2 : 1);
    let wrks: any[] = [];
    const workerMap = new Map<string, any>();
    const repMap = new Map<string, any>();

    let deletedIds = getDeletedWorkerIds();
    const workersMasterList: any[] = [];
    if (workersMasterDoc && workersMasterDoc.exists()) {
      const wmData = workersMasterDoc.data();
      if (Array.isArray(wmData?.deletedWorkerIds)) {
        deletedIds = saveDeletedWorkerIds([...deletedIds, ...wmData.deletedWorkerIds]);
      }
      if (Array.isArray(wmData?.workers)) {
        workersMasterList.push(...wmData.workers);
      }
    }

    // 1. Load from master document if present
    if (masterDoc.exists()) {
      const data = masterDoc.data();
      wrks = mergeWorkerListsSafely(workersMasterList, data.workers || [], deletedIds);
    } else if (workersMasterList.length > 0) {
      wrks = mergeWorkerListsSafely(workersMasterList, [], deletedIds);
    }

    if (masterDoc.exists()) {
      const data = masterDoc.data();
      let hasMasterAttendance = false;
      let earliestMasterDate: string | null = null;

      // A. Master attendance records snapshot (authoritative live state)
      if (Array.isArray(data.attendanceRecords) && data.attendanceRecords.length > 0) {
        hasMasterAttendance = true;
        data.attendanceRecords.forEach((r: any) => {
          if (!r || !r.workerId) return;
          const cleanAtt: Record<string, boolean> = {};
          if (r.attendance) {
            Object.entries(r.attendance).forEach(([d, val]) => {
              if (val === true) {
                cleanAtt[d] = true;
                if (!earliestMasterDate || d < earliestMasterDate) {
                  earliestMasterDate = d;
                }
              }
            });
          }
          const cleanDateUpdatedAt: Record<string, number> = {};
          if (r.dateUpdatedAt && typeof r.dateUpdatedAt === 'object') {
            Object.entries(r.dateUpdatedAt).forEach(([d, ts]) => {
              const numTs = Number(ts);
              if (!isNaN(numTs) && numTs > 0) cleanDateUpdatedAt[d] = numTs;
            });
          }
          workerMap.set(r.workerId, {
            workerId: r.workerId,
            dailyAllowance: r.dailyAllowance || 25000,
            attendance: cleanAtt,
            customStatus: { ...(r.customStatus || {}) },
            reasons: { ...(r.reasons || {}) },
            signatures: { ...(r.signatures || {}) },
            dateUpdatedAt: cleanDateUpdatedAt,
          });
        });
      }

      // B. Collect weeklyReports without overwriting live or explicitly modified attendance dates
      if (Array.isArray(data.weeklyReports)) {
        data.weeklyReports.forEach((rep: any) => {
          if (!rep) return;
          const repKey = rep.id || `${rep.weekStartDate}_${rep.weekEndDate}`;
          repMap.set(repKey, rep);

          // Only backfill archived weeks if master attendanceRecords is empty OR the report is strictly older than earliestMasterDate
          const isArchivedOlderWeek = Boolean(
            rep.weekEndDate && earliestMasterDate && rep.weekEndDate < earliestMasterDate
          );
          if (hasMasterAttendance && !isArchivedOlderWeek) {
            return;
          }

          if (Array.isArray(rep.records)) {
            rep.records.forEach((rec: any) => {
              if (!rec || !rec.workerId) return;
              const existing = workerMap.get(rec.workerId) || {
                workerId: rec.workerId,
                dailyAllowance: rec.dailyAllowance || 25000,
                attendance: {},
                customStatus: {},
                reasons: {},
                signatures: {},
                dateUpdatedAt: {}
              };

              if (rec.attendance) {
                Object.entries(rec.attendance).forEach(([d, val]) => {
                  // Never overwrite if dateUpdatedAt already tracks this date
                  if (val === true && !existing.dateUpdatedAt?.[d]) {
                    existing.attendance[d] = true;
                  }
                });
              }
              if (rec.customStatus) {
                Object.entries(rec.customStatus).forEach(([d, val]) => {
                  if (val && !existing.dateUpdatedAt?.[d] && !existing.attendance?.[d]) {
                    existing.customStatus[d] = val;
                  }
                });
              }
              if (rec.reasons) {
                Object.entries(rec.reasons).forEach(([d, val]) => {
                  if (val && !existing.dateUpdatedAt?.[d] && !existing.attendance?.[d]) {
                    existing.reasons[d] = val;
                  }
                });
              }
              workerMap.set(rec.workerId, existing);
            });
          }
        });
      }
    }

    // 2. Also check absen_records collection ONLY when newer than master dateUpdatedAt
    if (!isFirestorePermissionDenied()) {
      try {
        const snap = await getDocs(collection(activeDb, "absen_records"));
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
              signatures: {},
              dateUpdatedAt: {}
            };
            const abTs = ab.timestamp ? Date.parse(ab.timestamp) : 0;
            const existingCellTs = Number(existing.dateUpdatedAt?.[ab.date] || 0);
            // Only apply if admin didn't already modify/uncheck this date more recently
            if (existingCellTs > 0 && (isNaN(abTs) || abTs <= existingCellTs)) {
              return;
            }
            if (ab.status === "Hadir" || ab.status === true) {
              existing.attendance[ab.date] = true;
            } else if (ab.status === "Absen") {
              delete existing.attendance[ab.date];
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
      } catch (fbErr: any) {
        markFirestoreQuotaExceeded(fbErr);
        markFirestorePermissionDenied(fbErr);
        if (!isFirestorePermissionError(fbErr)) {
          console.warn("Fallback absen_records notice:", fbErr?.message || fbErr);
        }
      }
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
    markFirestoreQuotaExceeded(err);
    markFirestorePermissionDenied(err);
    if (!isFirestorePermissionError(err)) {
      console.warn("Notice: Failed to load attendance from Firestore:", err?.message);
    }
    return null;
  }
};

// ⚡ Realtime Cloud Listener: Sinkronisasi instan dua arah antara Komputer dan HP via Firestore onSnapshot
export const subscribeToAttendanceFromFirestore = (
  onUpdate: (data: {
    attendanceRecords: any[];
    workers: any[];
    weeklyReports: any[];
    latestActiveDate?: string | null;
    clientUpdatedAt?: number;
  }) => void
): (() => void) => {
  const activeDb = getSharedFirestoreDb() || db;
  if (
    !activeDb ||
    !hasAbsenAuthUser() ||
    isFirestoreQuotaExceeded() ||
    isFirestorePermissionDenied() ||
    isFirestoreInternalDegraded()
  ) {
    return () => {};
  }
  try {
    const unsub = onSnapshot(doc(activeDb, "attendance", "current_records"), (snapshot) => {
      if (!snapshot.exists()) return;
      // Skip local optimistic echoes so rapid clicks stay rock-solid
      if (snapshot.metadata.hasPendingWrites) return;
      recordFirestoreReads(1);
      const data = snapshot.data();
      if (!data) return;

      // Skip exact echo from this tab's own most recent write
      if (
        data.clientWriteId === CLIENT_ATTENDANCE_SESSION_ID &&
        Number(data.clientUpdatedAt || 0) <= lastLocalAttendanceWriteAt
      ) {
        return;
      }

      const workerMap = new Map<string, any>();
      const wrks = data.workers || [];
      const repMap = new Map<string, any>();

      // 1. Process authoritative master attendance records (NEVER overlay weeklyReports on top of live data)
      if (Array.isArray(data.attendanceRecords)) {
        data.attendanceRecords.forEach((r: any) => {
          if (!r || !r.workerId) return;
          const cleanAtt: Record<string, boolean> = {};
          if (r.attendance) {
            Object.entries(r.attendance).forEach(([d, val]) => {
              if (val === true) cleanAtt[d] = true;
            });
          }
          const cleanDateUpdatedAt: Record<string, number> = {};
          if (r.dateUpdatedAt && typeof r.dateUpdatedAt === 'object') {
            Object.entries(r.dateUpdatedAt).forEach(([d, ts]) => {
              const numTs = Number(ts);
              if (!isNaN(numTs) && numTs > 0) cleanDateUpdatedAt[d] = numTs;
            });
          }
          workerMap.set(r.workerId, {
            workerId: r.workerId,
            dailyAllowance: r.dailyAllowance || 25000,
            attendance: cleanAtt,
            customStatus: { ...(r.customStatus || {}) },
            reasons: { ...(r.reasons || {}) },
            signatures: { ...(r.signatures || {}) },
            dateUpdatedAt: cleanDateUpdatedAt,
          });
        });
      }

      // 2. Collect weeklyReports metadata separately (do NOT overwrite attendanceRecords from weeklyReports!)
      if (Array.isArray(data.weeklyReports)) {
        data.weeklyReports.forEach((rep: any) => {
          if (!rep) return;
          const repKey = rep.id || `${rep.weekStartDate}_${rep.weekEndDate}`;
          repMap.set(repKey, rep);
        });
      }

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

      const consolidated = Array.from(workerMap.values());
      onUpdate({
        attendanceRecords: consolidated,
        workers: wrks,
        weeklyReports: Array.from(repMap.values()),
        latestActiveDate,
        clientUpdatedAt: Number(data.clientUpdatedAt || 0)
      });
    }, (err) => {
      markFirestoreQuotaExceeded(err);
      markFirestorePermissionDenied(err);
      markFirestoreInternalAssertion(err);
      if (!isFirestorePermissionError(err) && !isFirestoreInternalAssertionError(err)) {
        console.warn("[Firestore Attendance Realtime] Snapshot listener notice:", err?.message || err);
      }
    });

    return unsub;
  } catch (err: any) {
    markFirestoreInternalAssertion(err);
    console.warn("[Firestore Attendance Realtime] Setup notice:", err?.message);
    return () => {};
  }
};



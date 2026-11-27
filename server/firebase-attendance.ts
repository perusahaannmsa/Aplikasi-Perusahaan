import { initializeApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  orderBy, 
  limit 
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import fs from "fs";
import path from "path";

// 🔒 PERMANENT LOCKED FIREBASE CONFIGURATION (PT Nusantara Mineral Sukses Abadi)
// JANGAN DIUBAH / DO NOT MODIFY - KONFIGURASI RESMI PERMANEN PERUSAHAAN
export const PERMANENT_NMSA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDfIvUOLqAULR9eKy0rkqJfY_99Q4rxy2M",
  authDomain: "pencatatan-voucher-perusahaan.firebaseapp.com",
  databaseURL: "https://pencatatan-voucher-perusahaan-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pencatatan-voucher-perusahaan",
  storageBucket: "pencatatan-voucher-perusahaan.firebasestorage.app",
  messagingSenderId: "5344554002",
  appId: "1:5344554002:web:9137a500fbb8f3223b7ccb",
  measurementId: "G-1249N852Y5",
  firestoreDatabaseId: "(default)"
};

// Cached Firebase instances
let firebaseApp: any = null;
let firestoreDb: any = null;
let firebaseAuth: any = null;

// Server-side Firestore quota & permission-denied guards
let isServerQuotaExceeded = false;
let lastServerQuotaExceededTime = 0;
const SERVER_QUOTA_COOLDOWN_MS = 60 * 60 * 1000;

let isServerPermissionDenied = false;
let lastServerPermissionDeniedTime = 0;
const SERVER_PERMISSION_COOLDOWN_MS = 15 * 60 * 1000;
let loggedMissingServerAuthNotice = false;

export function checkServerQuotaExceeded(): boolean {
  if (!isServerQuotaExceeded) return false;
  if (Date.now() - lastServerQuotaExceededTime > SERVER_QUOTA_COOLDOWN_MS) {
    isServerQuotaExceeded = false;
    return false;
  }
  return true;
}

export function markServerQuotaExceeded(err: any) {
  const errStr = String(err?.message || err?.code || err || '');
  if (err?.code === 'resource-exhausted' || err?.code === 8 || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded') || errStr.includes('quota exceeded')) {
    if (!isServerQuotaExceeded) {
      console.warn('⚠️ [Server Firestore Quota Guard] Kuota harian Firestore (RESOURCE_EXHAUSTED) tercapai. Menangguhkan operasi ke Firestore di server sementara.');
    }
    isServerQuotaExceeded = true;
    lastServerQuotaExceededTime = Date.now();
  }
}

export function isPermissionDeniedError(err: any): boolean {
  const errStr = String(err?.message || err?.code || err || '');
  return (
    err?.code === 'permission-denied' ||
    err?.code === 7 ||
    errStr.includes('PERMISSION_DENIED') ||
    errStr.includes('permission-denied') ||
    errStr.includes('insufficient permissions')
  );
}

export function checkServerPermissionDenied(): boolean {
  if (!isServerPermissionDenied) return false;
  if (Date.now() - lastServerPermissionDeniedTime > SERVER_PERMISSION_COOLDOWN_MS) {
    isServerPermissionDenied = false;
    return false;
  }
  return true;
}

export function markServerPermissionDenied(err: any) {
  if (isPermissionDeniedError(err)) {
    if (!isServerPermissionDenied) {
      console.warn('⚠️ [Server Firestore Auth/Rules Guard] Akses Firestore di server ditolak (PERMISSION_DENIED). Sinkronisasi server ke Firestore ditangguhkan sementara; sinkronisasi browser tetap aktif untuk user yang sudah login.');
    }
    isServerPermissionDenied = true;
    lastServerPermissionDeniedTime = Date.now();
  }
}

export function hasConfiguredServerAuthCredentials(): boolean {
  const email = process.env.FIREBASE_ADMIN_EMAIL || process.env.FIREBASE_AUTH_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD || process.env.FIREBASE_AUTH_PASSWORD;
  return Boolean(email && password);
}

export function initFirebaseFirestore() {
  try {
    if (firestoreDb) return firestoreDb;
    let cfg = PERMANENT_NMSA_FIREBASE_CONFIG;
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      try {
        const fileCfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (fileCfg && fileCfg.apiKey && fileCfg.projectId) {
          cfg = { ...PERMANENT_NMSA_FIREBASE_CONFIG, ...fileCfg };
        }
      } catch (err: any) {
        console.warn("[Firebase] Could not parse config file, using permanent config:", err.message);
      }
    }
    const apps = getApps();
    firebaseApp = apps.length > 0 ? apps[0] : initializeApp({
      apiKey: cfg.apiKey,
      projectId: cfg.projectId,
      authDomain: cfg.authDomain,
      storageBucket: cfg.storageBucket,
      messagingSenderId: cfg.messagingSenderId
    });

    const dbId = cfg.firestoreDatabaseId || "(default)";
    firestoreDb = getFirestore(firebaseApp, dbId);
    firebaseAuth = getAuth(firebaseApp);
    console.log(`[Firebase] Firestore initialized successfully with database: ${dbId} (project: ${cfg.projectId})`);
    return firestoreDb;
  } catch (err: any) {
    console.error("[Firebase] Error initializing Firestore:", err.message);
    return null;
  }
}

// Check or establish server authentication
export async function ensureServerAuth(): Promise<any> {
  try {
    if (!firebaseApp) {
      initFirebaseFirestore();
    }
    if (!firebaseAuth && firebaseApp) {
      firebaseAuth = getAuth(firebaseApp);
    }
    if (firebaseAuth?.currentUser) {
      return firebaseAuth.currentUser;
    }
    const email = process.env.FIREBASE_ADMIN_EMAIL || process.env.FIREBASE_AUTH_EMAIL;
    const password = process.env.FIREBASE_ADMIN_PASSWORD || process.env.FIREBASE_AUTH_PASSWORD;
    if (email && password && firebaseAuth) {
      const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      isServerPermissionDenied = false;
      console.log(`[Firebase] Server successfully authenticated as ${cred.user.email}`);
      return cred.user;
    }
  } catch (err: any) {
    console.warn("[Firebase] Server auth notice:", err.message);
  }
  return null;
}

// 1. Sync current attendance state to Firestore
export async function syncAttendanceToFirestore(state: {
  attendanceRecords?: any[];
  workers?: any[];
  weeklyReports?: any[];
  attendanceLogs?: any[];
}) {
  if (checkServerQuotaExceeded() || checkServerPermissionDenied()) return false;
  const db = initFirebaseFirestore();
  if (!db) return false;

  // Wajib ada sesi Firebase Auth di server karena firestore.rules mewajibkan request.auth != null
  const serverUser = await ensureServerAuth();
  if (!serverUser) {
    if (!loggedMissingServerAuthNotice) {
      loggedMissingServerAuthNotice = true;
      console.info("[Firebase] Server auto-sync ke Firestore dilewati karena sesi Firebase Auth server belum dikonfigurasi (sinkronisasi Firestore dijalankan langsung dari browser user yang login).");
    }
    return false;
  }

  try {
    const timestamp = new Date().toISOString();

    // 1. Save master attendance records snapshot (strip falsy attendance dates)
    if (state.attendanceRecords && state.attendanceRecords.length > 0) {
      const cleaned = state.attendanceRecords.map((r: any) => {
        const cleanAtt: Record<string, boolean> = {};
        if (r && r.attendance) {
          Object.entries(r.attendance).forEach(([d, val]) => {
            if (val === true) cleanAtt[d] = true;
          });
        }
        return {
          ...r,
          attendance: cleanAtt
        };
      });

      await setDoc(doc(db, "attendance", "current_records"), {
        attendanceRecords: cleaned,
        workers: state.workers || [],
        weeklyReports: state.weeklyReports || [],
        updatedAt: timestamp,
        totalWorkers: (state.workers || []).length,
        totalRecords: cleaned.length,
        totalReports: (state.weeklyReports || []).length
      }, { merge: true });
    } else if (state.weeklyReports && state.weeklyReports.length > 0) {
      await setDoc(doc(db, "attendance", "current_records"), {
        weeklyReports: state.weeklyReports || [],
        updatedAt: timestamp,
        totalReports: (state.weeklyReports || []).length
      }, { merge: true });
    }

    // 2. Keep attendance/workers_master safely merged with any newer cloud workers
    if (Array.isArray(state.workers) && state.workers.length > 0 && !checkServerPermissionDenied()) {
      try {
        const wmRef = doc(db, "attendance", "workers_master");
        const wmSnap = await getDoc(wmRef).catch(() => null);
        const existingWmData = wmSnap && wmSnap.exists() ? wmSnap.data() : null;
        const deletedSet = new Set<string>([
          ...((state as any).deletedWorkerIds || []),
          ...(Array.isArray(existingWmData?.deletedWorkerIds) ? existingWmData.deletedWorkerIds : [])
        ].map(String));

        const wMap = new Map<string, any>();
        if (existingWmData && Array.isArray(existingWmData.workers)) {
          existingWmData.workers.forEach((w: any) => {
            if (w && w.id && !deletedSet.has(String(w.id))) wMap.set(String(w.id), w);
          });
        }
        state.workers.forEach((w: any) => {
          if (!w || !w.id) return;
          const id = String(w.id);
          if (deletedSet.has(id)) return;
          const prev = wMap.get(id);
          if (!prev || Number(w.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
            wMap.set(id, { ...(prev || {}), ...w });
          }
        });
        const mergedWorkers = Array.from(wMap.values());
        await setDoc(wmRef, {
          workers: mergedWorkers,
          deletedWorkerIds: Array.from(deletedSet),
          totalWorkers: mergedWorkers.length,
          updatedAt: timestamp
        }, { merge: true });
      } catch (wmErr: any) {
        markServerQuotaExceeded(wmErr);
        markServerPermissionDenied(wmErr);
      }
    }

    console.log("[Firebase] Successfully synchronized attendance & weekly reports to Firestore!");
    return true;

  } catch (err: any) {
    markServerQuotaExceeded(err);
    markServerPermissionDenied(err);
    if (!isPermissionDeniedError(err)) {
      console.warn("[Firebase] Notice during attendance Firestore sync:", err.message);
    }
    return false;
  }
}

// 2. Restore attendance state from Firestore on startup
export async function restoreAttendanceFromFirestore(currentState: any): Promise<any> {
  if (checkServerQuotaExceeded() || checkServerPermissionDenied()) return currentState;
  const db = initFirebaseFirestore();
  if (!db) return currentState;

  const serverUser = await ensureServerAuth();
  if (!serverUser) {
    return currentState;
  }

  try {
    console.log("[Firebase] Checking Firestore for saved attendance data...");
    const masterDocSnap = await getDoc(doc(db, "attendance", "current_records"));
    let updated = { ...currentState };
    let hasChanges = false;

    if (masterDocSnap.exists()) {
      const data = masterDocSnap.data();
      const mergedMap = new Map();
      let hasMasterAttendance = false;
      let earliestMasterDate: string | null = null;

      // 1. First populate from authoritative master attendanceRecords
      if (data && Array.isArray(data.attendanceRecords) && data.attendanceRecords.length > 0) {
        hasMasterAttendance = true;
        data.attendanceRecords.forEach((r: any) => {
          if (r && r.workerId) {
            const cleanAtt: Record<string, boolean> = {};
            if (r.attendance) {
              Object.entries(r.attendance).forEach(([d, v]) => {
                if (v === true) {
                  cleanAtt[d] = true;
                  if (!earliestMasterDate || d < earliestMasterDate) {
                    earliestMasterDate = d;
                  }
                }
              });
            }
            mergedMap.set(r.workerId, {
              ...r,
              attendance: cleanAtt,
              customStatus: { ...(r.customStatus || {}) },
              reasons: { ...(r.reasons || {}) },
              dateUpdatedAt: { ...(r.dateUpdatedAt || {}) }
            });
          }
        });
      }

      // 2. Only backfill archived historical weeklyReports that predate master attendanceRecords
      if (data && Array.isArray(data.weeklyReports)) {
        data.weeklyReports.forEach((rep: any) => {
          const isArchivedOlderWeek = Boolean(
            rep?.weekEndDate && earliestMasterDate && rep.weekEndDate < earliestMasterDate
          );
          if (hasMasterAttendance && !isArchivedOlderWeek) {
            return;
          }
          if (rep && Array.isArray(rep.records)) {
            rep.records.forEach((rec: any) => {
              if (!rec || !rec.workerId) return;
              const existing = mergedMap.get(rec.workerId) || {
                workerId: rec.workerId,
                dailyAllowance: rec.dailyAllowance || 25000,
                attendance: {},
                customStatus: {},
                reasons: {},
                dateUpdatedAt: {}
              };
              if (rec.attendance) {
                Object.entries(rec.attendance).forEach(([d, v]) => {
                  if (v === true && !existing.dateUpdatedAt?.[d]) existing.attendance[d] = true;
                });
              }
              if (rec.customStatus) {
                Object.entries(rec.customStatus).forEach(([d, v]) => {
                  if (v && !existing.dateUpdatedAt?.[d] && !existing.attendance?.[d]) existing.customStatus[d] = v;
                });
              }
              if (rec.reasons) {
                Object.entries(rec.reasons).forEach(([d, v]) => {
                  if (v && !existing.dateUpdatedAt?.[d] && !existing.attendance?.[d]) existing.reasons[d] = v;
                });
              }
              mergedMap.set(rec.workerId, existing);
            });
          }
        });
      }

      // 3. Overlay any existing local server state records ONLY where local dateUpdatedAt is newer
      (currentState.attendanceRecords || []).forEach((r: any) => {
        if (r && r.workerId) {
          const cloud = mergedMap.get(r.workerId);
          if (!cloud) {
            mergedMap.set(r.workerId, r);
          } else {
            const nextAtt = { ...(cloud.attendance || {}) };
            const nextCust = { ...(cloud.customStatus || {}) };
            const nextReas = { ...(cloud.reasons || {}) };
            const nextTs = { ...(cloud.dateUpdatedAt || {}) };
            const allDates = new Set([
              ...Object.keys(cloud.attendance || {}),
              ...Object.keys(r.attendance || {}),
              ...Object.keys(cloud.dateUpdatedAt || {}),
              ...Object.keys(r.dateUpdatedAt || {})
            ]);
            allDates.forEach((d) => {
              const cloudDateTs = Number(cloud.dateUpdatedAt?.[d] || 0);
              const localDateTs = Number(r.dateUpdatedAt?.[d] || 0);
              if (localDateTs > cloudDateTs || (cloudDateTs === 0 && localDateTs === 0 && r.attendance?.[d] === true && !cloud.attendance?.[d])) {
                if (r.attendance?.[d] === true) nextAtt[d] = true;
                else delete nextAtt[d];
                if (r.customStatus?.[d]) nextCust[d] = r.customStatus[d];
                else delete nextCust[d];
                if (r.reasons?.[d]) nextReas[d] = r.reasons[d];
                else delete nextReas[d];
                if (localDateTs > 0) nextTs[d] = localDateTs;
              }
            });
            mergedMap.set(r.workerId, {
              ...cloud,
              ...r,
              attendance: nextAtt,
              customStatus: nextCust,
              reasons: nextReas,
              dateUpdatedAt: nextTs
            });
          }
        }
      });

      // 4. Also check absen_records collection ONLY when newer than dateUpdatedAt
      try {
        const snap = await getDocs(collection(db, "absen_records"));
        if (!snap.empty) {
          snap.forEach((d) => {
            const ab = d.data();
            if (!ab || !ab.workerId || !ab.date) return;
            const existing = mergedMap.get(ab.workerId) || {
              workerId: ab.workerId,
              dailyAllowance: 25000,
              attendance: {},
              customStatus: {},
              reasons: {},
              dateUpdatedAt: {}
            };
            const abTs = ab.timestamp ? Date.parse(ab.timestamp) : 0;
            const existingTs = Number(existing.dateUpdatedAt?.[ab.date] || 0);
            if (existingTs > 0 && (isNaN(abTs) || abTs <= existingTs)) return;
            if (ab.status === "Hadir" || ab.status === true) {
              existing.attendance[ab.date] = true;
            } else if (ab.status && ab.status !== "Absen") {
              existing.customStatus[ab.date] = ab.status;
              if (ab.reason) existing.reasons[ab.date] = ab.reason;
            }
            mergedMap.set(ab.workerId, existing);
          });
        }
      } catch (fbErr: any) {
        // Silently ignore if legacy collection is restricted or removed in Firestore rules
        if (fbErr?.code !== 'permission-denied' && !fbErr?.message?.includes('insufficient permissions')) {
          console.warn("[Firebase] Notice reading absen_records fallback:", fbErr?.message || fbErr);
        }
      }

      const consolidatedList = Array.from(mergedMap.values());
      if (consolidatedList.length > 0) {
        console.log(`[Firebase] Restored ${consolidatedList.length} consolidated attendance records with all dates from Firestore.`);
        updated.attendanceRecords = consolidatedList;
        hasChanges = true;
      }

      // 5. Restore workers from attendance/workers_master + attendance/current_records
      let cloudWmWorkers: any[] = [];
      let cloudDeletedIds: string[] = Array.isArray(currentState.deletedWorkerIds) ? [...currentState.deletedWorkerIds] : [];
      try {
        const wmSnap = await getDoc(doc(db, "attendance", "workers_master"));
        if (wmSnap.exists()) {
          const wmData = wmSnap.data();
          if (Array.isArray(wmData?.workers)) cloudWmWorkers = wmData.workers;
          if (Array.isArray(wmData?.deletedWorkerIds)) {
            cloudDeletedIds = Array.from(new Set([...cloudDeletedIds, ...wmData.deletedWorkerIds.map(String)]));
          }
        }
      } catch (_) {}

      const deletedSet = new Set(cloudDeletedIds.map(String));
      const allCloudWorkers = [...(Array.isArray(data?.workers) ? data.workers : []), ...cloudWmWorkers];
      if (allCloudWorkers.length > 0) {
        const curWorkers = currentState.workers || [];
        const wMap = new Map<string, any>();
        allCloudWorkers.forEach((w: any) => {
          if (w && w.id && !deletedSet.has(String(w.id))) {
            const prev = wMap.get(String(w.id));
            if (!prev || Number(w.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
              wMap.set(String(w.id), { ...(prev || {}), ...w });
            }
          }
        });
        curWorkers.forEach((w: any) => {
          if (w && w.id && !deletedSet.has(String(w.id))) {
            const prev = wMap.get(String(w.id));
            if (!prev || Number(w.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
              wMap.set(String(w.id), { ...(prev || {}), ...w });
            }
          }
        });
        updated.workers = Array.from(wMap.values()).sort((a: any, b: any) =>
          String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true })
        );
        updated.deletedWorkerIds = cloudDeletedIds;
        hasChanges = true;
      }

      // 6. Restore weekly reports
      if (data && Array.isArray(data.weeklyReports) && data.weeklyReports.length > 0) {
        console.log(`[Firebase] Restoring ${data.weeklyReports.length} weekly reports from Firestore.`);
        const repMap = new Map();
        data.weeklyReports.forEach((r: any) => {
          if (r) {
            const key = r.id || `${r.weekStartDate}_${r.weekEndDate}`;
            repMap.set(key, r);
          }
        });
        (currentState.weeklyReports || []).forEach((r: any) => {
          if (r) {
            const key = r.id || `${r.weekStartDate}_${r.weekEndDate}`;
            repMap.set(key, { ...(repMap.get(key) || {}), ...r });
          }
        });
        updated.weeklyReports = Array.from(repMap.values());
        hasChanges = true;
      }
    }

    return hasChanges ? updated : currentState;
  } catch (err: any) {
    markServerQuotaExceeded(err);
    markServerPermissionDenied(err);
    if (!isPermissionDeniedError(err)) {
      console.warn("[Firebase] Notice restoring attendance from Firestore:", err.message);
    }
    return currentState;
  }
}

// 3. Sync NPWP master records to Firestore
export async function syncNpwpToFirestore(npwpRecords: any[]): Promise<boolean> {
  if (checkServerQuotaExceeded() || checkServerPermissionDenied()) return false;
  const db = initFirebaseFirestore();
  if (!db) return false;

  const serverUser = await ensureServerAuth();
  if (!serverUser) {
    if (!loggedMissingServerAuthNotice) {
      loggedMissingServerAuthNotice = true;
      console.info("[Firebase] Server auto-sync ke Firestore dilewati karena sesi Firebase Auth server belum dikonfigurasi (sinkronisasi Firestore dijalankan langsung dari browser user yang login).");
    }
    return false;
  }

  try {
    const timestamp = new Date().toISOString();
    const list = Array.isArray(npwpRecords) ? npwpRecords : [];

    // 1. Save master NPWP snapshot document in 'npwp_records' collection with ID 'master_records'
    await setDoc(doc(db, "npwp_records", "master_records"), {
      npwpRecords: list,
      totalRecords: list.length,
      updatedAt: timestamp
    }, { merge: true });

    // 2. Granular docs in npwp_records collection for each record
    for (const record of list) {
      if (checkServerQuotaExceeded() || checkServerPermissionDenied()) break;
      if (record && record.id) {
        await setDoc(doc(db, "npwp_records", String(record.id)), {
          ...record,
          updatedAt: timestamp
        }, { merge: true });
      }
    }

    console.log(`[Firebase] Successfully synchronized ${list.length} NPWP records to Firestore!`);
    return true;
  } catch (err: any) {
    markServerQuotaExceeded(err);
    markServerPermissionDenied(err);
    if (!isPermissionDeniedError(err)) {
      console.warn("[Firebase] Error during NPWP Firestore sync:", err.message);
    }
    return false;
  }
}

// 4. Restore NPWP records from Firestore
export async function restoreNpwpFromFirestore(currentState: any): Promise<any> {
  if (checkServerQuotaExceeded() || checkServerPermissionDenied()) return currentState;
  const db = initFirebaseFirestore();
  if (!db) return currentState;

  const serverUser = await ensureServerAuth();
  if (!serverUser) {
    return currentState;
  }

  try {
    console.log("[Firebase] Checking Firestore for saved NPWP records...");
    let updated = { ...currentState };
    let hasChanges = false;
    let cloudRecords: any[] = [];

    // Check npwp_records/master_records
    try {
      const snap = await getDoc(doc(db, "npwp_records", "master_records"));
      if (snap.exists()) {
        const d = snap.data();
        if (d && Array.isArray(d.npwpRecords) && d.npwpRecords.length > 0) {
          cloudRecords = d.npwpRecords;
        }
      }
    } catch (e: any) {
      markServerQuotaExceeded(e);
      markServerPermissionDenied(e);
      if (!isPermissionDeniedError(e)) {
        console.warn("[Firebase] Could not fetch master_records:", e.message);
      }
    }

    // Check app_settings/general if not found yet
    if (cloudRecords.length === 0 && !checkServerQuotaExceeded() && !checkServerPermissionDenied()) {
      try {
        const setSnap = await getDoc(doc(db, "app_settings", "general"));
        if (setSnap.exists()) {
          const sd = setSnap.data();
          if (sd && Array.isArray(sd.npwpRecords) && sd.npwpRecords.length > 0) {
            cloudRecords = sd.npwpRecords;
          }
        }
      } catch (e) {
        markServerQuotaExceeded(e);
        markServerPermissionDenied(e);
      }
    }

    // Fallback: list all docs in npwp_records collection
    if (cloudRecords.length === 0 && !checkServerQuotaExceeded() && !checkServerPermissionDenied()) {
      try {
        const colSnap = await getDocs(collection(db, "npwp_records"));
        colSnap.forEach((d) => {
          if (d.id !== "master_records") {
            cloudRecords.push({ id: d.id, ...d.data() });
          }
        });
      } catch (e) {
        markServerQuotaExceeded(e);
        markServerPermissionDenied(e);
      }
    }

    if (cloudRecords.length > 0) {
      console.log(`[Firebase] Found ${cloudRecords.length} NPWP records in Firestore.`);
      const map = new Map<string, any>();
      cloudRecords.forEach((r: any) => {
        if (r && (r.id || r.npwpNumber)) {
          const key = r.id || r.npwpNumber;
          map.set(String(key), r);
        }
      });
      (currentState.npwpRecords || []).forEach((r: any) => {
        if (r && (r.id || r.npwpNumber)) {
          const key = r.id || r.npwpNumber;
          map.set(String(key), { ...(map.get(String(key)) || {}), ...r });
        }
      });
      updated.npwpRecords = Array.from(map.values());
      hasChanges = true;
    }

    return hasChanges ? updated : currentState;
  } catch (err: any) {
    markServerQuotaExceeded(err);
    markServerPermissionDenied(err);
    if (!isPermissionDeniedError(err)) {
      console.warn("[Firebase] Notice restoring NPWP from Firestore:", err.message);
    }
    return currentState;
  }
}


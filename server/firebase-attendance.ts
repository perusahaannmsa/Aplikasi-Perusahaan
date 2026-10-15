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
  const db = initFirebaseFirestore();
  if (!db) return false;

  // Ensure server auth if available (optional for attendance collection)
  await ensureServerAuth();

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

    console.log("[Firebase] Successfully synchronized attendance & weekly reports to Firestore!");
    return true;

  } catch (err: any) {
    console.warn("[Firebase] Notice during attendance Firestore sync:", err.message);
    return false;
  }
}

// 2. Restore attendance state from Firestore on startup
export async function restoreAttendanceFromFirestore(currentState: any): Promise<any> {
  const db = initFirebaseFirestore();
  if (!db) return currentState;

  // Ensure server auth if available (optional for attendance collection)
  await ensureServerAuth();

  try {
    console.log("[Firebase] Checking Firestore for saved attendance data...");
    const masterDocSnap = await getDoc(doc(db, "attendance", "current_records"));
    let updated = { ...currentState };
    let hasChanges = false;

    if (masterDocSnap.exists()) {
      const data = masterDocSnap.data();
      if (data && Array.isArray(data.attendanceRecords) && data.attendanceRecords.length > 0) {
        console.log(`[Firebase] Restoring ${data.attendanceRecords.length} attendance records from Firestore.`);
        // Merge attendance records: keep any newer local records, but restore all from Firestore
        const mergedMap = new Map();
        // First put cloud records
        data.attendanceRecords.forEach((r: any) => {
          if (r && r.workerId) mergedMap.set(r.workerId, r);
        });
        // Then overlay any existing local records
        (currentState.attendanceRecords || []).forEach((r: any) => {
          if (r && r.workerId) {
            const cloud = mergedMap.get(r.workerId);
            if (!cloud) {
              mergedMap.set(r.workerId, r);
            } else {
              // merge attendance dates
              mergedMap.set(r.workerId, {
                ...cloud,
                ...r,
                attendance: { ...(cloud.attendance || {}), ...(r.attendance || {}) },
                customStatus: { ...(cloud.customStatus || {}), ...(r.customStatus || {}) },
                reasons: { ...(cloud.reasons || {}), ...(r.reasons || {}) }
              });
            }
          }
        });
        updated.attendanceRecords = Array.from(mergedMap.values());
        hasChanges = true;
      }
    }

    // Restore weekly reports directly from master document
    if (masterDocSnap.exists()) {
      const data = masterDocSnap.data();
      if (data && Array.isArray(data.weeklyReports) && data.weeklyReports.length > 0) {
        console.log(`[Firebase] Restoring ${data.weeklyReports.length} weekly reports from attendance/current_records.`);
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
    console.warn("[Firebase] Notice restoring attendance from Firestore:", err.message);
    return currentState;
  }
}

// 3. Sync NPWP master records to Firestore
export async function syncNpwpToFirestore(npwpRecords: any[]): Promise<boolean> {
  const db = initFirebaseFirestore();
  if (!db) return false;

  await ensureServerAuth();

  try {
    const timestamp = new Date().toISOString();
    const list = Array.isArray(npwpRecords) ? npwpRecords : [];

    // 1. Save master NPWP snapshot document in 'npwp_records' collection with ID 'master_records'
    await setDoc(doc(db, "npwp_records", "master_records"), {
      npwpRecords: list,
      totalRecords: list.length,
      updatedAt: timestamp
    }, { merge: true });

    // 2. Also save to app_settings general doc for settings sync
    try {
      await setDoc(doc(db, "app_settings", "general"), {
        npwpRecords: list,
        updatedAt: timestamp
      }, { merge: true });
    } catch (_) {}

    // 3. Granular docs in npwp_records collection for each record
    for (const record of list) {
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
    console.warn("[Firebase] Error during NPWP Firestore sync:", err.message);
    return false;
  }
}

// 4. Restore NPWP records from Firestore
export async function restoreNpwpFromFirestore(currentState: any): Promise<any> {
  const db = initFirebaseFirestore();
  if (!db) return currentState;

  await ensureServerAuth();

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
      console.warn("[Firebase] Could not fetch master_records:", e.message);
    }

    // Check app_settings/general if not found yet
    if (cloudRecords.length === 0) {
      try {
        const setSnap = await getDoc(doc(db, "app_settings", "general"));
        if (setSnap.exists()) {
          const sd = setSnap.data();
          if (sd && Array.isArray(sd.npwpRecords) && sd.npwpRecords.length > 0) {
            cloudRecords = sd.npwpRecords;
          }
        }
      } catch (_) {}
    }

    // Fallback: list all docs in npwp_records collection
    if (cloudRecords.length === 0) {
      try {
        const colSnap = await getDocs(collection(db, "npwp_records"));
        colSnap.forEach((d) => {
          if (d.id !== "master_records") {
            cloudRecords.push({ id: d.id, ...d.data() });
          }
        });
      } catch (_) {}
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
    console.warn("[Firebase] Notice restoring NPWP from Firestore:", err.message);
    return currentState;
  }
}


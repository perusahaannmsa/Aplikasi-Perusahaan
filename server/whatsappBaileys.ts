import express from "express";
import pino from "pino";
import path from "path";
import fs from "fs";
import os from "os";
import QRCode from "qrcode";

export type BaileysConnectionStatus = "disconnected" | "connecting" | "qr" | "connected";

export interface BaileysHostBridge {
  readState: () => any;
  writeState: (state: any) => void;
  getJakartaDateStr: () => string;
  checkIsHolidayOrWeekend: (dateStr: string) => Promise<{ isBlocked: boolean; reason?: string }>;
  getReminderMessage: (name: string, url: string, workerId?: string, dateStr?: string) => string;
  validateAdminToken?: (req: express.Request) => boolean;
}

export interface BaileysChatMessage {
  id: string;
  workerId?: string | null;
  workerName: string;
  phone: string;
  direction: "incoming" | "outgoing";
  type: "text" | "location" | "reminder" | "auto_reply";
  message: string;
  latitude?: number;
  longitude?: number;
  timestamp: number;
  timeWib: string;
}

export interface BaileysStatusSnapshot {
  status: BaileysConnectionStatus;
  isConnected: boolean;
  qr: string | null;
  qrSeq: number;
  qrUpdatedAt: number | null;
  qrExpiresAt: number | null;
  qrTtlMs: number;
  serverNow: number;
  isPairingInProgress: boolean;
  pairingCode: string | null;
  pairingPhone: string | null;
  pairingRequestedAt: number | null;
  user: { id: string; name?: string } | null;
  error: string | null;
  hasCredentials: boolean;
  hasBackup: boolean;
  pendingApproval: boolean;
  requireApprovalOnConnect: boolean;
}

export interface WhatsAppBaileysModule {
  router: express.Router;
  init: (forceRestart?: boolean) => Promise<any>;
  disconnect: (autoRestart?: boolean, skipRemoteLogout?: boolean) => Promise<{ success: boolean; message?: string; error?: string }>;
  refreshQr: () => Promise<BaileysStatusSnapshot>;
  requestPairingCode: (phone: string) => Promise<string>;
  sendMessage: (
    phoneNumber: string,
    text: string,
    meta?: { type?: "text" | "reminder" | "auto_reply"; workerId?: string; workerName?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  getStatus: () => BaileysStatusSnapshot;
  isConnected: () => boolean;
  isTransitioning: () => boolean;
  hasCredentials: () => boolean;
  stop: () => void;
}

const OFFICE_LAT = -6.244342;
const OFFICE_LON = 106.843073;
const MAX_DISTANCE_METERS = 150;

// Dynamic loader for @whiskeysockets/baileys supporting both ESM and CJS runtimes
let baileysPkgCache: any = null;
async function loadBaileys(): Promise<any> {
  if (baileysPkgCache) return baileysPkgCache;
  baileysPkgCache = await import("@whiskeysockets/baileys");
  return baileysPkgCache;
}

function resolveExport(pkg: any, key: string): any {
  return pkg?.[key] ?? pkg?.default?.[key] ?? (key === "makeWASocket" ? pkg?.default : undefined);
}

export function normalizePhoneNumber(phone: string): string {
  let clean = String(phone || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("620")) {
    clean = "62" + clean.slice(3);
  } else if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}

export function formatToWaJid(phone: string): string {
  const cleaned = normalizePhoneNumber(phone);
  return cleaned.endsWith("@s.whatsapp.net") ? cleaned : `${cleaned}@s.whatsapp.net`;
}

function calcDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function createWhatsAppBaileysModule(bridge: BaileysHostBridge): WhatsAppBaileysModule {
  const isPersistentProd = Boolean(
    process.env.RENDER ||
      process.env.RAILWAY_ENVIRONMENT ||
      (process.env.NODE_ENV === "production" && !process.env.VERCEL)
  );
  const tmpBase = process.env.VERCEL ? "/tmp" : path.join(os.tmpdir(), "nmsa-wa-baileys");
  const authDir = isPersistentProd
    ? path.join(process.cwd(), "auth_info_baileys")
    : path.join(tmpBase, "auth_info_baileys");
  const backupFile = isPersistentProd
    ? path.join(process.cwd(), "wa_session_backup.json")
    : path.join(tmpBase, "wa_session_backup.json");

  try {
    if (!fs.existsSync(tmpBase)) fs.mkdirSync(tmpBase, { recursive: true });
  } catch {
    // ignore
  }

  // Socket & lifecycle state
  let sock: any = null;
  let connectionStatus: BaileysConnectionStatus = "disconnected";
  let qrCodeDataUrl: string | null = null;
  let qrSeq = 0;
  let qrUpdatedAt: number | null = null;
  let qrExpiresAt: number | null = null;
  let qrTtlMs = 60000;
  let isPairingInProgress = false;
  let pendingCredsSave: Promise<void> = Promise.resolve();
  let activeSaveCreds: (() => Promise<void>) | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let presenceKeepAliveTimer: NodeJS.Timeout | null = null;
  let autoReminderTimer: NodeJS.Timeout | null = null;
  let connectedUser: { id: string; name?: string } | null = null;
  let lastError: string | null = null;
  let reconnectAttempts = 0;
  let activePairingCode: string | null = null;
  let activePairingPhone: string | null = null;
  let activePairingRequestedAt: number | null = null;
  let lastUiPollAt = 0;
  let cachedWaVersion: { version: [number, number, number]; fetchedAt: number } | null = null;
  let isTransitioningSocket = false;
  let initPromise: Promise<any> | null = null;
  let waActionMutex: Promise<any> = Promise.resolve();
  let awaitingManualApproval = false;

  function markUiPoll() {
    lastUiPollAt = Date.now();
  }

  function formatWibTime(ts = Date.now()): string {
    return (
      new Date(ts).toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB"
    );
  }

  function appendChatLog(entry: {
    phone: string;
    direction: "incoming" | "outgoing";
    type?: "text" | "location" | "reminder" | "auto_reply";
    message: string;
    workerId?: string | null;
    workerName?: string;
    latitude?: number;
    longitude?: number;
    timestamp?: number;
  }) {
    try {
      const ds = bridge.readState();
      const normPhone = normalizePhoneNumber(entry.phone);
      const workers = ds.workers || [];
      const matchedWorker = workers.find(
        (w: any) => w.phoneNumber && normalizePhoneNumber(w.phoneNumber) === normPhone
      );
      const ts = entry.timestamp || Date.now();
      const item: BaileysChatMessage = {
        id: `wa-${ts}-${Math.random().toString(36).slice(2, 7)}`,
        workerId: entry.workerId ?? matchedWorker?.id ?? null,
        workerName: matchedWorker?.name || entry.workerName || `+${normPhone}`,
        phone: normPhone,
        direction: entry.direction,
        type: entry.type || "text",
        message: entry.message,
        ...(entry.latitude !== undefined ? { latitude: entry.latitude } : {}),
        ...(entry.longitude !== undefined ? { longitude: entry.longitude } : {}),
        timestamp: ts,
        timeWib: formatWibTime(ts),
      };
      if (!Array.isArray(ds.waChatLogs)) ds.waChatLogs = [];
      ds.waChatLogs.push(item);
      if (ds.waChatLogs.length > 300) {
        ds.waChatLogs = ds.waChatLogs.slice(-300);
      }
      bridge.writeState(ds);
    } catch (err) {
      console.warn("[Baileys] Failed recording chat log:", err);
    }
  }

  function isCredsAuthenticated(parsed: any): boolean {
    if (!parsed || typeof parsed !== "object") return false;
    if (parsed.registered === true) return true;
    return Boolean(parsed.account && parsed.me?.id && String(parsed.me.id).includes(":"));
  }

  function hasRegisteredLocalCreds(): boolean {
    try {
      const credsPath = path.join(authDir, "creds.json");
      if (!fs.existsSync(credsPath)) return false;
      const parsed = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
      return isCredsAuthenticated(parsed);
    } catch {
      return false;
    }
  }

  function hasAuthBackup(): boolean {
    if (fs.existsSync(backupFile)) return true;
    try {
      const ds = bridge.readState();
      if (ds?.waSessionBackup && ds.waSessionBackup["creds.json"]) return true;
    } catch {
      // ignore
    }
    return false;
  }

  function hasCredentials(): boolean {
    return fs.existsSync(path.join(authDir, "creds.json")) || hasAuthBackup();
  }

  function cleanupAuthFolder() {
    try {
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error("[Baileys] Failed cleaning auth folder:", err);
    }
  }

  function backupAuthStateToPersistentStore() {
    try {
      if (!fs.existsSync(authDir) || !hasRegisteredLocalCreds()) return;
      const files = fs.readdirSync(authDir);
      const bundle: Record<string, string> = {};
      for (const f of files) {
        const fullPath = path.join(authDir, f);
        if (fs.statSync(fullPath).isFile()) {
          bundle[f] = fs.readFileSync(fullPath, "utf-8");
        }
      }
      if (Object.keys(bundle).length > 0) {
        fs.writeFileSync(backupFile, JSON.stringify(bundle), "utf-8");
        try {
          const ds = bridge.readState();
          ds.waSessionBackup = bundle;
          bridge.writeState(ds);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("[Baileys] Failed backing up auth state:", err);
    }
  }

  function restoreAuthStateFromPersistentStore(): boolean {
    try {
      const credsFile = path.join(authDir, "creds.json");
      if (fs.existsSync(credsFile)) return true;

      let bundle: Record<string, string> | null = null;
      if (fs.existsSync(backupFile)) {
        try {
          bundle = JSON.parse(fs.readFileSync(backupFile, "utf-8"));
        } catch {
          bundle = null;
        }
      }
      if (!bundle) {
        try {
          const ds = bridge.readState();
          if (ds?.waSessionBackup && typeof ds.waSessionBackup === "object" && ds.waSessionBackup["creds.json"]) {
            bundle = ds.waSessionBackup;
          }
        } catch {
          bundle = null;
        }
      }
      if (bundle && bundle["creds.json"]) {
        if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
        for (const [filename, content] of Object.entries(bundle)) {
          fs.writeFileSync(path.join(authDir, filename), content, "utf-8");
        }
        return true;
      }
    } catch (err) {
      console.error("[Baileys] Failed restoring auth state:", err);
    }
    return false;
  }

  function clearAuthBackup() {
    try {
      if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
      const ds = bridge.readState();
      if (ds && (ds.waSessionBackup !== undefined || ds.waConnected || ds.waUser)) {
        delete ds.waSessionBackup;
        delete ds.waConnected;
        delete ds.waUser;
        bridge.writeState(ds);
      }
    } catch {
      // ignore
    }
  }

  function isConnected(): boolean {
    return connectionStatus === "connected" && sock !== null;
  }

  function isTransitioning(): boolean {
    return isTransitioningSocket || Boolean(initPromise);
  }

  function getStatus(): BaileysStatusSnapshot {
    const hasLocalCreds = fs.existsSync(path.join(authDir, "creds.json"));
    const hasBackup = hasAuthBackup();
    let requireApprovalOnConnect = true;
    let pendingApproval = false;
    try {
      const ds = bridge.readState();
      const todayYMD = bridge.getJakartaDateStr();
      requireApprovalOnConnect = ds.requireApprovalOnConnect !== false;
      pendingApproval =
        isConnected() &&
        requireApprovalOnConnect &&
        ds.lastCronSentDate !== todayYMD &&
        (awaitingManualApproval || ds.approvedSendDate !== todayYMD);
    } catch {
      // ignore
    }
    return {
      status: connectionStatus,
      isConnected: isConnected(),
      qr: qrCodeDataUrl,
      qrSeq,
      qrUpdatedAt,
      qrExpiresAt,
      qrTtlMs,
      serverNow: Date.now(),
      isPairingInProgress,
      pairingCode: activePairingCode,
      pairingPhone: activePairingPhone,
      pairingRequestedAt: activePairingRequestedAt,
      user: connectedUser,
      error: lastError,
      hasCredentials: hasLocalCreds || hasBackup,
      hasBackup,
      pendingApproval,
      requireApprovalOnConnect,
    };
  }

  function getHostOrigin(req?: express.Request, stateData?: any): string {
    if (process.env.APP_URL && !process.env.APP_URL.includes("localhost")) {
      return process.env.APP_URL.replace(/\/+$/, "");
    }
    if (process.env.HOST_ORIGIN && !process.env.HOST_ORIGIN.includes("localhost")) {
      return process.env.HOST_ORIGIN.replace(/\/+$/, "");
    }
    if (
      stateData?.lastHostOrigin &&
      !stateData.lastHostOrigin.includes("localhost") &&
      !stateData.lastHostOrigin.includes("127.0.0.1")
    ) {
      return String(stateData.lastHostOrigin).replace(/\/+$/, "");
    }
    if (req) {
      const host = req.get("host");
      if (host) return `${req.protocol}://${host}`;
    }
    return `http://localhost:${process.env.PORT || 3000}`;
  }

  async function init(forceRestart = false): Promise<any> {
    if (initPromise) return initPromise;
    initPromise = doInit(forceRestart).finally(() => {
      initPromise = null;
    });
    return initPromise;
  }

  async function doInit(forceRestart = false) {
    try {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      await pendingCredsSave.catch(() => {});

      const localCredsPath = path.join(authDir, "creds.json");
      if (fs.existsSync(localCredsPath) && !hasRegisteredLocalCreds()) {
        cleanupAuthFolder();
      }

      restoreAuthStateFromPersistentStore();

      if (!forceRestart && connectionStatus === "connected" && sock) {
        return sock;
      }

      if (sock) {
        try {
          sock.ev?.removeAllListeners?.("connection.update");
          sock.ev?.removeAllListeners?.("creds.update");
          sock.ev?.removeAllListeners?.("messages.upsert");
          sock.end?.(undefined);
        } catch {
          // ignore
        }
        sock = null;
      }
      activeSaveCreds = null;

      connectionStatus = "connecting";
      lastError = null;
      if (forceRestart) {
        qrCodeDataUrl = null;
        qrUpdatedAt = null;
        qrExpiresAt = null;
      }

      const pkg = await loadBaileys();
      const makeWASocket = resolveExport(pkg, "makeWASocket");
      const useMultiFileAuthState = resolveExport(pkg, "useMultiFileAuthState");
      const DisconnectReason = resolveExport(pkg, "DisconnectReason") || { loggedOut: 401, restartRequired: 515, forbidden: 403, timedOut: 408 };
      const Browsers = resolveExport(pkg, "Browsers");
      const makeCacheableSignalKeyStore = resolveExport(pkg, "makeCacheableSignalKeyStore");
      const fetchLatestWaWebVersion = resolveExport(pkg, "fetchLatestWaWebVersion");
      const fetchLatestBaileysVersion = resolveExport(pkg, "fetchLatestBaileysVersion");

      if (typeof useMultiFileAuthState !== "function" || typeof makeWASocket !== "function") {
        throw new Error("Modul @whiskeysockets/baileys gagal dimuat.");
      }

      let waVersion: [number, number, number] | undefined;
      if (cachedWaVersion && Date.now() - cachedWaVersion.fetchedAt < 30 * 60 * 1000) {
        waVersion = cachedWaVersion.version;
      } else {
        if (typeof fetchLatestWaWebVersion === "function") {
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 4500);
            const vWebResult = await fetchLatestWaWebVersion({ signal: controller.signal }).finally(() => clearTimeout(tid));
            if (vWebResult?.isLatest && Array.isArray(vWebResult.version)) {
              waVersion = vWebResult.version as [number, number, number];
              cachedWaVersion = { version: waVersion, fetchedAt: Date.now() };
            }
          } catch {
            // fallback below
          }
        }
        if (!waVersion && typeof fetchLatestBaileysVersion === "function") {
          try {
            const vResult = await fetchLatestBaileysVersion();
            if (Array.isArray(vResult?.version)) {
              waVersion = vResult.version as [number, number, number];
              cachedWaVersion = { version: waVersion, fetchedAt: Date.now() };
            }
          } catch {
            // default version
          }
        }
      }

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      activeSaveCreds = saveCreds;

      const authKeys =
        typeof makeCacheableSignalKeyStore === "function"
          ? makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }) as any)
          : state.keys;

      const browserConfig =
        Browsers && typeof Browsers.ubuntu === "function"
          ? Browsers.ubuntu("Chrome")
          : ["Ubuntu", "Chrome", "22.04.4"];

      sock = makeWASocket({
        ...(waVersion ? { version: waVersion } : {}),
        auth: {
          creds: state.creds,
          keys: authKeys,
        },
        browser: browserConfig,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
      });

      sock.ev.on("creds.update", () => {
        pendingCredsSave = pendingCredsSave
          .then(async () => {
            await saveCreds();
            if (isCredsAuthenticated(state?.creds)) {
              backupAuthStateToPersistentStore();
            }
          })
          .catch((e) => console.warn("[Baileys] Error saving creds:", e));
      });

      // Handle worker replies & Share Location check-in cleanly + log real-time chats
      sock.ev.on("messages.upsert", async (m: any) => {
        try {
          if (m.type !== "notify") return;
          for (const msg of m.messages || []) {
            if (msg.key?.fromMe) continue;
            const senderJid = msg.key?.remoteJid;
            if (!senderJid || !senderJid.endsWith("@s.whatsapp.net")) continue;

            const appState = bridge.readState();
            const cleanSenderPhone = normalizePhoneNumber(senderJid.split("@")[0]);
            const workers = appState.workers || [];
            const workerAny = workers.find(
              (w: any) => w.phoneNumber && normalizePhoneNumber(w.phoneNumber) === cleanSenderPhone
            );
            const worker = workerAny && workerAny.isActive ? workerAny : null;

            const incomingLoc = msg.message?.locationMessage;
            const incomingText = (
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.documentMessage?.caption ||
              ""
            ).trim();

            if (incomingLoc) {
              const lat = incomingLoc.degreesLatitude;
              const lon = incomingLoc.degreesLongitude;
              const dist = Math.round(calcDistanceMeters(lat, lon, OFFICE_LAT, OFFICE_LON));
              appendChatLog({
                phone: cleanSenderPhone,
                direction: "incoming",
                type: "location",
                message: `📍 Share Location (jarak ${dist}m dari kantor)`,
                workerId: workerAny?.id || null,
                workerName: workerAny?.name || msg.pushName || `+${cleanSenderPhone}`,
                latitude: lat,
                longitude: lon,
              });
            } else if (incomingText) {
              appendChatLog({
                phone: cleanSenderPhone,
                direction: "incoming",
                type: "text",
                message: incomingText,
                workerId: workerAny?.id || null,
                workerName: workerAny?.name || msg.pushName || `+${cleanSenderPhone}`,
              });
            }

            if (appState.masterAutoSendEnabled === false) continue;
            if (!worker) continue;

            const todayDate = bridge.getJakartaDateStr();
            const records = appState.attendanceRecords || [];
            const matchedRecord = records.find((r: any) => r.workerId === worker.id);

            // 1. Share Location check-in
            if (incomingLoc && appState.allowLocationCheckin !== false) {
              const lat = incomingLoc.degreesLatitude;
              const lon = incomingLoc.degreesLongitude;
              const distance = calcDistanceMeters(lat, lon, OFFICE_LAT, OFFICE_LON);

              if (distance <= MAX_DISTANCE_METERS) {
                if (matchedRecord) {
                  if (!matchedRecord.attendance) matchedRecord.attendance = {};
                  matchedRecord.attendance[todayDate] = true;
                  if (matchedRecord.customStatus?.[todayDate]) delete matchedRecord.customStatus[todayDate];
                  if (matchedRecord.reasons?.[todayDate]) delete matchedRecord.reasons[todayDate];
                } else {
                  records.push({
                    workerId: worker.id,
                    attendance: { [todayDate]: true },
                    dailyAllowance: 25000,
                  });
                }

                const timeStr = new Date().toLocaleTimeString("id-ID", {
                  timeZone: "Asia/Jakarta",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                if (!appState.attendanceLogs) appState.attendanceLogs = [];
                appState.attendanceLogs.unshift({
                  id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  workerId: worker.id,
                  workerName: worker.name,
                  date: todayDate,
                  time: timeStr,
                  latitude: lat,
                  longitude: lon,
                  distance: Math.round(distance),
                  address: "Absen via WhatsApp Baileys (Share Location)",
                  status: "BERHASIL",
                });
                if (appState.attendanceLogs.length > 500) {
                  appState.attendanceLogs = appState.attendanceLogs.slice(0, 500);
                }
                appState.attendanceRecords = records;
                bridge.writeState(appState);

                const replyText = `✅ *Absen Kehadiran Diterima!*\n\nHalo *${worker.name}*, kehadiran Anda hari ini (*${todayDate}*) dicatat otomatis (jarak: *${Math.round(distance)}m* dari kantor).`;
                await sock.sendMessage(senderJid, { text: replyText });
                appendChatLog({
                  phone: cleanSenderPhone,
                  direction: "outgoing",
                  type: "auto_reply",
                  message: replyText,
                  workerId: worker.id,
                  workerName: worker.name,
                });
              } else {
                const replyText = `⚠️ *Absen Ditolak (Jarak: ${Math.round(distance)}m)*\n\nLokasi Anda di luar batas *${MAX_DISTANCE_METERS}m* kantor. Balas *Sakit*, *Izin*, *Cuti*, atau *Meeting* jika berhalangan hadir.`;
                await sock.sendMessage(senderJid, { text: replyText });
                appendChatLog({
                  phone: cleanSenderPhone,
                  direction: "outgoing",
                  type: "auto_reply",
                  message: replyText,
                  workerId: worker.id,
                  workerName: worker.name,
                });
              }
              continue;
            }

            // 2. Text reply handling (status or attendance link)
            const messageText = incomingText;
            if (!messageText) continue;

            const cleanMsg = messageText.toLowerCase();
            let selectedStatus: string | null = null;
            if (cleanMsg === "1" || cleanMsg === "sakit" || cleanMsg.startsWith("sakit ")) selectedStatus = "Sakit";
            else if (cleanMsg === "2" || cleanMsg === "izin" || cleanMsg.startsWith("izin ")) selectedStatus = "Izin";
            else if (cleanMsg === "3" || cleanMsg === "cuti" || cleanMsg.startsWith("cuti ")) selectedStatus = "Cuti";
            else if (cleanMsg === "4" || cleanMsg === "meeting" || cleanMsg.startsWith("meeting ")) selectedStatus = "Meeting";

            const hostOrigin = getHostOrigin(undefined, appState);
            const attendanceUrl = `${hostOrigin}/?view=absen&workerId=${encodeURIComponent(worker.id)}&quick=true`;

            if (selectedStatus) {
              if (matchedRecord) {
                if (!matchedRecord.attendance) matchedRecord.attendance = {};
                matchedRecord.attendance[todayDate] = false;
                if (!matchedRecord.customStatus) matchedRecord.customStatus = {};
                matchedRecord.customStatus[todayDate] = selectedStatus;
                if (!matchedRecord.reasons) matchedRecord.reasons = {};
                matchedRecord.reasons[todayDate] = "Dipilih via WhatsApp Baileys";
              } else {
                records.push({
                  workerId: worker.id,
                  attendance: { [todayDate]: false },
                  customStatus: { [todayDate]: selectedStatus },
                  reasons: { [todayDate]: "Dipilih via WhatsApp Baileys" },
                  dailyAllowance: 25000,
                });
              }
              appState.attendanceRecords = records;
              bridge.writeState(appState);

              const replyText = `✅ *Status Absensi Tercatat: ${selectedStatus}*\n\nHalo *${worker.name}*, status hari ini (*${todayDate}*) telah dicatat.\n\nJika ingin mengubah ke Hadir, kirim Share Location saat di kantor atau buka:\n👉 ${attendanceUrl}`;
              await sock.sendMessage(senderJid, { text: replyText });
              appendChatLog({
                phone: cleanSenderPhone,
                direction: "outgoing",
                type: "auto_reply",
                message: replyText,
                workerId: worker.id,
                workerName: worker.name,
              });
            } else if (
              cleanMsg === "absen" ||
              cleanMsg === "presensi" ||
              cleanMsg === "link" ||
              cleanMsg.includes("link absen") ||
              cleanMsg === "menu"
            ) {
              const replyText = `Halo *${worker.name}*! 👋\n\nBerikut tautan presensi mandiri hari ini (*${todayDate}*):\n👉 ${attendanceUrl}\n\nAtau kirim *Share Location* saat berada di kantor.`;
              await sock.sendMessage(senderJid, { text: replyText });
              appendChatLog({
                phone: cleanSenderPhone,
                direction: "outgoing",
                type: "auto_reply",
                message: replyText,
                workerId: worker.id,
                workerName: worker.name,
              });
            }
          }
        } catch (err) {
          console.warn("[Baileys] Error processing incoming message:", err);
        }
      });

      let qrIndexInCycle = 0;
      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (isNewLogin) {
          isPairingInProgress = true;
          qrCodeDataUrl = null;
          qrUpdatedAt = null;
          qrExpiresAt = null;
          connectionStatus = "connecting";
          lastError = null;
          try {
            const ds = bridge.readState();
            ds.approvedSendDate = "";
            bridge.writeState(ds);
          } catch {
            // ignore
          }
        }

        if (qr) {
          isPairingInProgress = false;
          lastError = null;
          try {
            const renderedQr = await QRCode.toDataURL(qr, {
              width: 440,
              margin: 4,
              errorCorrectionLevel: "L",
              color: { dark: "#000000", light: "#ffffff" },
            });
            qrCodeDataUrl = renderedQr;
            qrSeq += 1;
            qrIndexInCycle += 1;
            const now = Date.now();
            qrUpdatedAt = now;
            qrTtlMs = qrIndexInCycle <= 1 ? 60000 : 20000;
            qrExpiresAt = now + qrTtlMs;
            connectionStatus = "qr";
          } catch {
            qrCodeDataUrl = null;
            qrExpiresAt = null;
          }
        }

        if (connection === "open") {
          connectionStatus = "connected";
          isPairingInProgress = false;
          activePairingCode = null;
          activePairingPhone = null;
          activePairingRequestedAt = null;
          qrCodeDataUrl = null;
          qrUpdatedAt = null;
          qrExpiresAt = null;
          reconnectAttempts = 0;
          lastError = null;
          const user = sock?.user;
          connectedUser = user ? { id: user.id, name: user.name || "WhatsApp Baileys" } : { id: "connected" };

          // Selalu tahan pengiriman otomatis setelah perangkat tersambung / selesai scan QR
          // sampai admin menyetujui pengiriman di modal Baileys (bila opsi persetujuan aktif)
          try {
            const ds = bridge.readState();
            if (ds.requireApprovalOnConnect !== false) {
              awaitingManualApproval = true;
            }
          } catch {
            awaitingManualApproval = true;
          }

          await pendingCredsSave.catch(() => {});
          if (activeSaveCreds) await activeSaveCreds().catch(() => {});
          backupAuthStateToPersistentStore();

          if (presenceKeepAliveTimer) clearInterval(presenceKeepAliveTimer);
          presenceKeepAliveTimer = setInterval(() => {
            if (sock && connectionStatus === "connected") {
              sock.sendPresenceUpdate?.("available").catch(() => {});
            }
          }, 45000);
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isRestartRequired = statusCode === 515 || statusCode === DisconnectReason?.restartRequired;
          const isLoggedOut = statusCode === 401 || statusCode === DisconnectReason?.loggedOut;
          const isForbidden = statusCode === 403 || statusCode === DisconnectReason?.forbidden;
          const errMsg = String((lastDisconnect?.error as any)?.message || "");
          const isQrTimedOut =
            errMsg.includes("QR refs attempts ended") || statusCode === 408 || statusCode === DisconnectReason?.timedOut;

          connectedUser = null;
          qrCodeDataUrl = null;
          qrUpdatedAt = null;
          qrExpiresAt = null;

          if (presenceKeepAliveTimer) {
            clearInterval(presenceKeepAliveTimer);
            presenceKeepAliveTimer = null;
          }

          if (isRestartRequired) {
            reconnectAttempts = 0;
            isPairingInProgress = true;
            connectionStatus = "connecting";
            await pendingCredsSave.catch(() => {});
            if (activeSaveCreds) await activeSaveCreds().catch(() => {});
            reconnectTimer = setTimeout(() => {
              init(true).catch(() => {});
            }, 150);
            return;
          }

          if (isLoggedOut || isForbidden) {
            const hadPairing = Boolean(activePairingCode);
            isPairingInProgress = false;
            activePairingCode = null;
            activePairingPhone = null;
            activePairingRequestedAt = null;
            connectionStatus = "disconnected";
            lastError = hadPairing
              ? `Permintaan Kode Pairing ditolak oleh WhatsApp (kode ${statusCode}). Pastikan nomor aktif dan perangkat tertaut belum penuh (maks 4).`
              : "Sesi WhatsApp telah keluar (logged out). Klik 'Refresh QR Baru' atau minta Kode Pairing baru.";
            cleanupAuthFolder();
            clearAuthBackup();
            reconnectAttempts = 0;
            return;
          }

          if (isQrTimedOut && !hasRegisteredLocalCreds()) {
            const hadPairing = Boolean(activePairingCode);
            isPairingInProgress = false;
            activePairingCode = null;
            activePairingPhone = null;
            activePairingRequestedAt = null;
            reconnectAttempts = 0;
            cleanupAuthFolder();
            clearAuthBackup();

            if (hadPairing) {
              connectionStatus = "disconnected";
              lastError = "Waktu konfirmasi Kode Pairing habis (~2 menit). Klik 'Minta Kode Pairing' lagi untuk membuat kode baru.";
              return;
            }

            if (Date.now() - lastUiPollAt >= 25000) {
              connectionStatus = "disconnected";
              lastError = null;
              return;
            }

            connectionStatus = "connecting";
            reconnectTimer = setTimeout(() => {
              init(true).catch(() => {});
            }, 500);
            return;
          }

          if (activePairingCode && !hasRegisteredLocalCreds()) {
            activePairingCode = null;
            activePairingPhone = null;
            activePairingRequestedAt = null;
            cleanupAuthFolder();
            lastError = `Koneksi terputus sementara (kode ${statusCode || "network"}) sebelum kode pairing dimasukkan. Silakan minta kode baru.`;
          }

          reconnectAttempts++;
          connectionStatus = "connecting";
          const delay = Math.min(15000, 1500 + Math.min(reconnectAttempts, 5) * 2000);
          reconnectTimer = setTimeout(() => {
            init().catch(() => {});
          }, delay);
        }
      });

      return sock;
    } catch (err: any) {
      isPairingInProgress = false;
      connectionStatus = "disconnected";
      lastError = err?.message || "Gagal menginisialisasi koneksi Baileys.";
      return null;
    }
  }

  async function disconnect(autoRestart = false, skipRemoteLogout = false) {
    try {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (presenceKeepAliveTimer) {
        clearInterval(presenceKeepAliveTimer);
        presenceKeepAliveTimer = null;
      }
      const wasConnected = connectionStatus === "connected";
      qrCodeDataUrl = null;
      qrUpdatedAt = null;
      qrExpiresAt = null;
      isPairingInProgress = false;
      activePairingCode = null;
      activePairingPhone = null;
      activePairingRequestedAt = null;
      connectedUser = null;
      connectionStatus = "disconnected";

      if (sock) {
        try {
          sock.ev?.removeAllListeners?.("connection.update");
          sock.ev?.removeAllListeners?.("creds.update");
          sock.ev?.removeAllListeners?.("messages.upsert");
          if (wasConnected && !skipRemoteLogout) {
            await sock.logout().catch(() => {});
          }
        } catch {
          // ignore
        }
        try {
          sock.end?.(undefined);
        } catch {
          // ignore
        }
        sock = null;
      }

      cleanupAuthFolder();
      clearAuthBackup();

      if (autoRestart) {
        reconnectTimer = setTimeout(() => {
          init(true).catch(() => {});
        }, 300);
      }

      return { success: true, message: "Sesi WhatsApp Baileys berhasil diputuskan." };
    } catch (err: any) {
      return { success: false, error: err?.message || "Gagal memutuskan koneksi." };
    }
  }

  async function refreshQr(): Promise<BaileysStatusSnapshot> {
    const run = async () => {
      isTransitioningSocket = true;
      try {
        try {
          const ds = bridge.readState();
          ds.approvedSendDate = "";
          bridge.writeState(ds);
        } catch {
          // ignore
        }
        awaitingManualApproval = true;
        connectionStatus = "connecting";
        await disconnect(false, true);
        connectionStatus = "connecting";
        await init(true);

        let freshStatus = getStatus();
        for (let i = 0; i < 25; i++) {
          if (freshStatus.qr || freshStatus.status === "qr" || freshStatus.status === "connected") break;
          await new Promise((r) => setTimeout(r, 200));
          freshStatus = getStatus();
        }
        return freshStatus;
      } finally {
        isTransitioningSocket = false;
      }
    };
    const next = waActionMutex.then(run, run);
    waActionMutex = next.catch(() => {});
    return next;
  }

  async function requestPairingCode(phone: string): Promise<string> {
    const run = async () => {
      const cleaned = normalizePhoneNumber(phone);
      if (cleaned.length < 9 || cleaned.length > 15) {
        throw new Error("Nomor WhatsApp tidak valid. Masukkan nomor lengkap (contoh: 0812xxxxxx atau 62812xxxxxx).");
      }

      isTransitioningSocket = true;
      try {
        const skipRemoteLogout = connectionStatus !== "connected";
        connectionStatus = "connecting";
        await disconnect(false, skipRemoteLogout);
        connectionStatus = "connecting";
        lastError = null;
        await init(true);

        const waitStart = Date.now();
        while (Date.now() - waitStart < 15000) {
          if (sock && sock.ws?.isOpen && getStatus().status === "qr") break;
          await new Promise((r) => setTimeout(r, 200));
        }

        if (!sock || !sock.ws?.isOpen || getStatus().status !== "qr") {
          throw new Error("Koneksi WebSocket Baileys belum siap. Silakan tunggu 2 detik lalu coba lagi.");
        }

        await new Promise((r) => setTimeout(r, 450));
        if (!sock || !sock.ws?.isOpen || typeof sock.requestPairingCode !== "function") {
          throw new Error("Socket Baileys terputus sebelum permintaan kode pairing dikirim.");
        }

        let iqErrorCode: string | null = null;
        let iqErrorText: string | null = null;
        let iqSettled = false;
        const currentWs = sock.ws;

        const frameListener = (frame: any) => {
          try {
            if (!frame || typeof frame !== "object" || frame instanceof Uint8Array) return;
            const fromAttr = frame.attrs?.from || "";
            if (frame.tag === "iq" && (!fromAttr || fromAttr === "@s.whatsapp.net" || fromAttr === "s.whatsapp.net")) {
              if (frame.attrs?.type === "error") {
                const errChild = Array.isArray(frame.content) ? frame.content.find((c: any) => c?.tag === "error") : null;
                iqErrorCode = errChild?.attrs?.code || frame.attrs?.code || "400";
                iqErrorText = errChild?.attrs?.text || "rejected";
                iqSettled = true;
              } else if (frame.attrs?.type === "result") {
                const regChild = Array.isArray(frame.content)
                  ? frame.content.find((c: any) => c?.tag === "link_code_companion_reg")
                  : null;
                if (regChild) iqSettled = true;
              }
            }
          } catch {
            // ignore
          }
        };

        currentWs?.on?.("frame", frameListener);
        let rawCode: string | undefined;
        try {
          rawCode = await sock.requestPairingCode(cleaned);
          const iqWaitStart = Date.now();
          while (!iqSettled && Date.now() - iqWaitStart < 2500) {
            await new Promise((r) => setTimeout(r, 100));
          }
        } finally {
          currentWs?.off?.("frame", frameListener);
        }

        if (iqErrorCode) {
          await disconnect(false, true);
          init(true).catch(() => {});
          if (iqErrorCode === "429") {
            throw new Error("Terlalu sering meminta kode pairing (batas WhatsApp 429). Tunggu beberapa menit atau gunakan Scan QR Code.");
          }
          throw new Error(`WhatsApp menolak permintaan kode pairing (kode ${iqErrorCode}: ${iqErrorText}). Pastikan nomor +${cleaned} aktif di WhatsApp.`);
        }

        if (rawCode) {
          const strCode = String(rawCode).trim().toUpperCase();
          const formatted = strCode.length === 8 && !strCode.includes("-") ? `${strCode.slice(0, 4)}-${strCode.slice(4)}` : strCode;
          activePairingCode = formatted;
          activePairingPhone = cleaned;
          activePairingRequestedAt = Date.now();
          lastError = null;
          return formatted;
        }

        throw new Error("Server WhatsApp belum merespons permintaan kode pairing. Silakan coba lagi.");
      } catch (err: any) {
        throw new Error(err?.message || "Gagal membuat Kode Pairing Baileys.");
      } finally {
        isTransitioningSocket = false;
      }
    };
    const next = waActionMutex.then(run, run);
    waActionMutex = next.catch(() => {});
    return next;
  }

  async function sendMessage(
    phoneNumber: string,
    text: string,
    meta?: { type?: "text" | "reminder" | "auto_reply"; workerId?: string; workerName?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!isConnected()) {
        return { success: false, error: "WhatsApp Baileys belum terhubung." };
      }

      const jid = formatToWaJid(phoneNumber);
      try {
        if (sock) {
          await sock.presenceSubscribe(jid).catch(() => {});
          await sock.sendPresenceUpdate("composing", jid).catch(() => {});
          const typingMs = Math.min(2500, Math.max(800, text.length * 10));
          await new Promise((r) => setTimeout(r, typingMs));
          await sock.sendPresenceUpdate("paused", jid).catch(() => {});
        }
      } catch {
        // ignore presence errors
      }

      if (!isConnected()) {
        return { success: false, error: "Koneksi WhatsApp Baileys terputus." };
      }

      await sock.sendMessage(jid, { text });
      appendChatLog({
        phone: phoneNumber,
        direction: "outgoing",
        type: meta?.type || "text",
        message: text,
        workerId: meta?.workerId,
        workerName: meta?.workerName,
      });
      await new Promise((r) => setTimeout(r, 800 + Math.floor(Math.random() * 600)));
      return { success: true };
    } catch (err: any) {
      const isClosed =
        err?.output?.statusCode === 428 ||
        err?.message?.includes("Connection Closed") ||
        err?.message?.includes("Precondition Required");
      if (isClosed) {
        connectionStatus = "connecting";
        setTimeout(() => init().catch(() => {}), 500);
        return { success: false, error: "Connection Closed (428) — menghubungkan ulang..." };
      }
      return { success: false, error: err?.message || "Gagal mengirim pesan WhatsApp." };
    }
  }

  async function executeAttendanceReminderBroadcast(options: { force?: boolean; markSent?: boolean; hostOrigin?: string }) {
    const state = bridge.readState();
    const todayYMD = bridge.getJakartaDateStr();
    const force = Boolean(options.force);

    if (!force) {
      if (state.masterAutoSendEnabled === false) {
        const msg = "Pengiriman otomatis dinonaktifkan (Master Switch OFF).";
        state.lastCronStatus = msg;
        bridge.writeState(state);
        return { success: true, skipped: true, message: msg, sentCount: 0, failedCount: 0 };
      }
      if (state.autoReminderEnabled === false) {
        const msg = "Jadwal pengingat otomatis dinonaktifkan.";
        state.lastCronStatus = msg;
        bridge.writeState(state);
        return { success: true, skipped: true, message: msg, sentCount: 0, failedCount: 0 };
      }
      if (state.requireApprovalOnConnect !== false && (awaitingManualApproval || state.approvedSendDate !== todayYMD)) {
        const msg = "Menunggu persetujuan admin setelah scan QR sebelum mengirim pengingat.";
        state.lastCronStatus = msg;
        bridge.writeState(state);
        return { success: true, skipped: true, pendingApproval: true, message: msg, sentCount: 0, failedCount: 0 };
      }

      const daysMap: Record<string, string> = {
        Sunday: "Minggu",
        Monday: "Senin",
        Tuesday: "Selasa",
        Wednesday: "Rabu",
        Thursday: "Kamis",
        Friday: "Jumat",
        Saturday: "Sabtu",
      };
      const dayNameEn = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Jakarta", weekday: "long" });
      const dayNameId = daysMap[dayNameEn] || "Senin";
      const activeDays = state.reminderActiveDays || ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
      if (!activeDays.includes(dayNameId)) {
        const msg = `Dilewati otomatis: Hari ${dayNameId} tidak aktif pada jadwal.`;
        state.lastCronStatus = msg;
        bridge.writeState(state);
        return { success: true, skipped: true, message: msg, sentCount: 0, failedCount: 0 };
      }

      const holidayCheck = await bridge.checkIsHolidayOrWeekend(todayYMD);
      if (holidayCheck.isBlocked) {
        const msg = `Dilewati otomatis: ${holidayCheck.reason}.`;
        state.lastCronStatus = msg;
        state.lastCronSentDate = todayYMD;
        bridge.writeState(state);
        return { success: true, skipped: true, message: msg, sentCount: 0, failedCount: 0 };
      }
    }

    if (!isConnected()) {
      const msg = "Pengingat dilewati: WhatsApp Baileys belum terhubung.";
      state.lastCronStatus = msg;
      bridge.writeState(state);
      return { success: false, notConnected: true, message: msg, sentCount: 0, failedCount: 0 };
    }

    const workers = state.workers || [];
    const records = state.attendanceRecords || [];
    const activeWorkers = workers.filter((w: any) => w.isActive);
    const absentWorkers = activeWorkers.filter((worker: any) => {
      const record = records.find((r: any) => r.workerId === worker.id);
      return !record || !record.attendance || !record.attendance[todayYMD];
    });

    if (absentWorkers.length === 0) {
      const msg = "Seluruh karyawan aktif sudah absen hari ini.";
      state.lastCronStatus = msg;
      if (!force || options.markSent) state.lastCronSentDate = todayYMD;
      bridge.writeState(state);
      return { success: true, message: msg, sentCount: 0, failedCount: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const origin = options.hostOrigin || getHostOrigin(undefined, state);
    const isFriday = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Jakarta", weekday: "long" }) === "Friday";
    const fridayParam = isFriday ? "&friday=true" : "";

    for (const worker of absentWorkers) {
      if (!isConnected()) {
        errors.push("Koneksi Baileys terputus di tengah pengiriman.");
        break;
      }
      if (!worker.phoneNumber) {
        failedCount++;
        continue;
      }
      const loginUrl = `${origin}/?view=absen&workerId=${encodeURIComponent(worker.id)}&id=${encodeURIComponent(worker.id)}&quick=true${fridayParam}`;
      const message = bridge.getReminderMessage(worker.name, loginUrl, worker.id, todayYMD);
      const result = await sendMessage(worker.phoneNumber, message, {
        type: "reminder",
        workerId: worker.id,
        workerName: worker.name,
      });
      if (result.success) {
        sentCount++;
      } else {
        failedCount++;
        if (result.error) errors.push(result.error);
        if (!isConnected()) break;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }

    state.lastCronStatus = `Terkirim ke ${sentCount} karyawan.${failedCount > 0 ? ` Gagal: ${failedCount}.` : ""}`;
    if (!force || options.markSent) {
      state.lastCronSentDate = todayYMD;
    }
    bridge.writeState(state);

    return {
      success: true,
      message: `Berhasil mengirim pengingat ke ${sentCount} karyawan.${failedCount > 0 ? ` (Gagal: ${failedCount})` : ""}`,
      sentCount,
      failedCount,
      errors,
    };
  }

  // Single background scheduler inside Baileys module (no duplicate loops)
  autoReminderTimer = setInterval(async () => {
    try {
      const state = bridge.readState();
      if (state.masterAutoSendEnabled === false || state.autoReminderEnabled === false) return;

      const todayYMD = bridge.getJakartaDateStr();
      if (state.lastCronSentDate === todayYMD) return;

      const jktTimeString = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
      const [currentHour, currentMinute] = jktTimeString.split(":").map(Number);
      const scheduledTime = state.autoReminderHour || "09:00";
      const [targetHour, targetMinute] = scheduledTime.split(":").map(Number);

      if (currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute)) {
        await executeAttendanceReminderBroadcast({ force: false, markSent: true });
      }
    } catch (e) {
      console.warn("[Baileys AutoReminder] Error:", e);
    }
  }, 30000);

  // Express Router mounted cleanly at /api/baileys
  const router = express.Router();

  router.get("/status", (req, res) => {
    try {
      const isBackgroundPoll = req.query.background === "1";
      if (!isBackgroundPoll) markUiPoll();

      let status = getStatus();
      if (!isTransitioning() && status.status === "disconnected" && (hasCredentials() || (!isBackgroundPoll && !status.error))) {
        init().catch(() => {});
        status = getStatus();
      }

      let lateReminderPending = false;
      let absentWorkersCount = 0;
      let absentWorkersNames: string[] = [];
      const todayYMD = bridge.getJakartaDateStr();

      try {
        const state = bridge.readState();
        const jktTimeString = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
        const [currentHour, currentMinute] = jktTimeString.split(":").map(Number);
        const scheduledTime = state.autoReminderHour || "09:00";
        const [targetHour, targetMinute] = scheduledTime.split(":").map(Number);
        const isTimeTrigger = currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute);
        const alreadySentToday = state.lastCronSentDate === todayYMD;

        const activeWorkers = (state.workers || []).filter((w: any) => w.isActive);
        const records = state.attendanceRecords || [];
        const absent = activeWorkers.filter((worker: any) => {
          const record = records.find((r: any) => r.workerId === worker.id);
          return !record || !record.attendance || !record.attendance[todayYMD];
        });
        absentWorkersCount = absent.length;
        absentWorkersNames = absent.map((w: any) => w.name);
        lateReminderPending = status.status === "connected" && isTimeTrigger && !alreadySentToday && absentWorkersCount > 0;
      } catch {
        // ignore state read errors
      }

      return res.json({
        success: true,
        ...status,
        lateReminderPending,
        absentWorkersCount,
        absentWorkersNames,
        todayDate: todayYMD,
      });
    } catch (err: any) {
      return res.json({
        success: false,
        status: "disconnected",
        isConnected: false,
        qr: null,
        user: null,
        error: err?.message || "Status Baileys tidak tersedia.",
        hasCredentials: false,
        hasBackup: false,
        lateReminderPending: false,
        absentWorkersCount: 0,
        absentWorkersNames: [],
        todayDate: bridge.getJakartaDateStr(),
      });
    }
  });

  router.post("/refresh-qr", async (_req, res) => {
    try {
      markUiPoll();
      const freshStatus = await refreshQr();
      return res.json({ success: true, ...freshStatus, message: "QR Code Baileys diperbarui." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Gagal memperbarui QR Code." });
    }
  });

  router.post("/pairing-code", async (req, res) => {
    markUiPoll();
    const { phone } = req.body || {};
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ success: false, error: "Nomor WhatsApp wajib diisi." });
    }
    try {
      const code = await requestPairingCode(String(phone).trim());
      const freshStatus = getStatus();
      return res.json({ ...freshStatus, success: true, code, pairingCode: code });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err?.message || "Gagal membuat Kode Pairing." });
    }
  });

  router.post("/disconnect", async (_req, res) => {
    const result = await disconnect(false, false);
    return res.json(result);
  });

  router.post("/send", async (req, res) => {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: "Nomor WhatsApp dan isi pesan wajib diisi." });
    }
    if (!isConnected()) {
      return res.status(400).json({
        success: false,
        error: "WhatsApp Baileys belum terhubung. Silakan scan QR atau gunakan Kode Pairing terlebih dahulu.",
      });
    }
    const result = await sendMessage(String(phone), String(message));
    return res.status(result.success ? 200 : 400).json(result);
  });

  router.get("/chats", (req, res) => {
    try {
      const state = bridge.readState();
      const filterPhone = req.query.phone ? normalizePhoneNumber(String(req.query.phone)) : "";
      const rawChats: BaileysChatMessage[] = Array.isArray(state.waChatLogs) ? state.waChatLogs : [];
      const chats = filterPhone
        ? rawChats.filter((c) => normalizePhoneNumber(c.phone) === filterPhone)
        : rawChats;
      const workers = (state.workers || [])
        .filter((w: any) => w.phoneNumber)
        .map((w: any) => ({
          id: w.id,
          name: w.name,
          role: w.role || "",
          phoneNumber: w.phoneNumber,
          normalizedPhone: normalizePhoneNumber(w.phoneNumber),
          isActive: Boolean(w.isActive),
        }));

      return res.json({
        success: true,
        chats,
        workers,
        total: chats.length,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, chats: [], workers: [], error: err?.message });
    }
  });

  router.post("/approve-reminder", async (req, res) => {
    try {
      const action = req.body?.action === "skip" ? "skip" : "send";
      const state = bridge.readState();
      const todayYMD = bridge.getJakartaDateStr();

      awaitingManualApproval = false;
      state.approvedSendDate = todayYMD;

      if (action === "skip") {
        state.lastCronSentDate = todayYMD;
        state.lastCronStatus = "Pengingat hari ini ditahan atas persetujuan admin.";
        bridge.writeState(state);
        return res.json({
          success: true,
          skipped: true,
          message: "Pengingat hari ini berhasil ditahan (tidak ada pesan dikirim).",
        });
      }

      bridge.writeState(state);
      const result = await executeAttendanceReminderBroadcast({
        force: true,
        markSent: true,
        hostOrigin: getHostOrigin(req, bridge.readState()),
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Gagal memproses persetujuan." });
    }
  });

  router.get("/settings", (_req, res) => {
    try {
      const state = bridge.readState();
      const waStatus = getStatus();
      const jktTimeString = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
      const todayYMD = bridge.getJakartaDateStr();
      const activeWorkers = (state.workers || []).filter((w: any) => w.isActive);
      const records = state.attendanceRecords || [];
      const pendingWorkers = activeWorkers.filter((worker: any) => {
        const record = records.find((r: any) => r.workerId === worker.id);
        return !record || !record.attendance || !record.attendance[todayYMD];
      });

      return res.json({
        success: true,
        masterAutoSendEnabled: state.masterAutoSendEnabled !== false,
        autoReminderEnabled: state.autoReminderEnabled !== false,
        requireApprovalOnConnect: state.requireApprovalOnConnect !== false,
        autoReminderHour: state.autoReminderHour || "09:00",
        reminderActiveDays: state.reminderActiveDays || ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"],
        skipHolidays: state.skipHolidays !== false,
        skipWeekends: state.skipWeekends !== false,
        requireFridaySignature: state.requireFridaySignature !== false,
        allowLocationCheckin: state.allowLocationCheckin !== false,
        lastCronPing: state.lastCronPing || "",
        lastCronStatus: state.lastCronStatus || "",
        lastCronSentDate: state.lastCronSentDate || "",
        serverTimeWIB: `${todayYMD} ${jktTimeString} WIB`,
        totalActiveWorkers: activeWorkers.length,
        pendingAttendanceCount: pendingWorkers.length,
        waConnected: waStatus.isConnected,
        waPhone: waStatus.user?.id ? waStatus.user.id.split(":")[0].split("@")[0] : null,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  });

  router.post("/settings", (req, res) => {
    try {
      const {
        masterAutoSendEnabled,
        autoReminderEnabled,
        requireApprovalOnConnect,
        autoReminderHour,
        reminderActiveDays,
        skipHolidays,
        skipWeekends,
        requireFridaySignature,
        allowLocationCheckin,
      } = req.body || {};

      const state = bridge.readState();
      if (masterAutoSendEnabled !== undefined) state.masterAutoSendEnabled = Boolean(masterAutoSendEnabled);
      if (autoReminderEnabled !== undefined) state.autoReminderEnabled = Boolean(autoReminderEnabled);
      if (requireApprovalOnConnect !== undefined) state.requireApprovalOnConnect = Boolean(requireApprovalOnConnect);
      if (autoReminderHour !== undefined) state.autoReminderHour = String(autoReminderHour);
      if (Array.isArray(reminderActiveDays)) state.reminderActiveDays = reminderActiveDays;
      if (skipHolidays !== undefined) state.skipHolidays = Boolean(skipHolidays);
      if (skipWeekends !== undefined) state.skipWeekends = Boolean(skipWeekends);
      if (requireFridaySignature !== undefined) state.requireFridaySignature = Boolean(requireFridaySignature);
      if (allowLocationCheckin !== undefined) state.allowLocationCheckin = Boolean(allowLocationCheckin);
      bridge.writeState(state);

      return res.json({
        success: true,
        message: "Pengaturan jadwal WhatsApp Baileys berhasil disimpan.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  });

  router.post("/trigger-reminder", async (req, res) => {
    try {
      const markSent = req.body?.markSent !== false;
      const state = bridge.readState();
      const todayYMD = bridge.getJakartaDateStr();
      awaitingManualApproval = false;
      state.approvedSendDate = todayYMD;
      bridge.writeState(state);

      const result = await executeAttendanceReminderBroadcast({
        force: true,
        markSent,
        hostOrigin: getHostOrigin(req, bridge.readState()),
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Gagal memicu pengingat." });
    }
  });

  router.all("/cron-reminder", async (req, res) => {
    try {
      const force = req.query.force === "true";
      const markSent = req.query.markSent !== "false";
      const state = bridge.readState();
      const todayYMD = bridge.getJakartaDateStr();
      const nowStr = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
      state.lastCronPing = `${todayYMD} ${nowStr} WIB`;
      bridge.writeState(state);

      const jktTimeString = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
      const [currentHour, currentMinute] = jktTimeString.split(":").map(Number);
      const scheduledTime = state.autoReminderHour || "09:00";
      const [targetHour, targetMinute] = scheduledTime.split(":").map(Number);
      const isTimeTrigger = currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute);
      const alreadySentToday = state.lastCronSentDate === todayYMD;

      if (force || (isTimeTrigger && !alreadySentToday)) {
        const result = await executeAttendanceReminderBroadcast({
          force,
          markSent,
          hostOrigin: getHostOrigin(req, state),
        });
        return res.json(result);
      }

      return res.json({
        success: true,
        message: alreadySentToday
          ? `Pengingat hari ini (${todayYMD}) sudah dikirim.`
          : `Standby menunggu jam ${scheduledTime} WIB.`,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  });

  return {
    router,
    init,
    disconnect,
    refreshQr,
    requestPairingCode,
    sendMessage,
    getStatus,
    isConnected,
    isTransitioning,
    hasCredentials,
    stop: () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (presenceKeepAliveTimer) clearInterval(presenceKeepAliveTimer);
      if (autoReminderTimer) clearInterval(autoReminderTimer);
    },
  };
}

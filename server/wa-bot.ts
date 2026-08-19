import * as baileys from "@whiskeysockets/baileys";
import pino from "pino";
import path from "path";
import fs from "fs";
import QRCode from "qrcode";

// Safely extract baileys methods handling any ESM/CJS interop issues
const getBaileysModule = () => {
  if (!baileys) return {} as any;
  return baileys;
};

const getMakeWASocket = () => {
  const pkg = getBaileysModule();
  if (typeof pkg.makeWASocket === "function") return pkg.makeWASocket;
  if (pkg.default && typeof pkg.default.makeWASocket === "function") return pkg.default.makeWASocket;
  if (pkg.default && typeof pkg.default.default === "function") return pkg.default.default;
  if (typeof pkg.default === "function") return pkg.default;
  return (pkg as any).makeWASocket || (pkg as any).default;
};

const getUseMultiFileAuthState = () => {
  const pkg = getBaileysModule();
  if (typeof pkg.useMultiFileAuthState === "function") return pkg.useMultiFileAuthState;
  if (pkg.default && typeof pkg.default.useMultiFileAuthState === "function") return pkg.default.useMultiFileAuthState;
  return (pkg as any).useMultiFileAuthState;
};

const getDisconnectReason = () => {
  const pkg = getBaileysModule();
  if (pkg.DisconnectReason) return pkg.DisconnectReason;
  if (pkg.default && pkg.default.DisconnectReason) return pkg.default.DisconnectReason;
  return (pkg as any).DisconnectReason || {};
};

const makeWASocket = getMakeWASocket();
const useMultiFileAuthState = getUseMultiFileAuthState();
const DisconnectReason = getDisconnectReason();

const AUTH_DIR = path.join(process.cwd(), "auth_info_baileys");

// Global state variables for WhatsApp Bot
let sock: any = null;
let connectionStatus: "disconnected" | "connecting" | "connected" | "qr" = "disconnected";
let qrCodeDataUrl: string | null = null;
let connectedUser: { id: string; name?: string } | null = null;
let lastError: string | null = null;

// Convert Indonesian/regular phone numbers to WhatsApp JID format
export function formatToWaJid(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  }
  
  if (!cleaned.endsWith("@s.whatsapp.net")) {
    return cleaned + "@s.whatsapp.net";
  }
  return cleaned;
}

// Check status helper
export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    qr: qrCodeDataUrl,
    user: connectedUser,
    error: lastError
  };
}

// Initialize/Start WhatsApp connection
export async function initWhatsApp() {
  try {
    if (connectionStatus === "connected" && sock) {
      return sock;
    }

    connectionStatus = "connecting";
    lastError = null;

    console.log("Baileys integration checks:", {
      makeWASocketType: typeof makeWASocket,
      useMultiFileAuthStateType: typeof useMultiFileAuthState,
      DisconnectReasonType: typeof DisconnectReason,
    });

    if (typeof useMultiFileAuthState !== "function") {
      throw new Error("useMultiFileAuthState is not a function. Check baileys bundle/import.");
    }

    if (typeof makeWASocket !== "function") {
      throw new Error("makeWASocket is not a function. Check baileys bundle/import.");
    }

    // Initialize Auth state folder
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Create Socket
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }) as any,
    });

    // Handle credential updates
    sock.ev.on("creds.update", saveCreds);

    // Handle incoming message replies from workers
    sock.ev.on("messages.upsert", async (m: any) => {
      try {
        if (m.type !== "notify") return;
        
        for (const msg of m.messages) {
          // Ignore self messages
          if (msg.key.fromMe) continue;
          
          const senderJid = msg.key.remoteJid;
          if (!senderJid || !senderJid.endsWith("@s.whatsapp.net")) continue;
          
          const senderPhone = senderJid.split("@")[0]; // e.g. "628123456789"
          
          // Load data-store to find if sender is a registered worker
          const DATA_FILE = path.join(process.cwd(), "data-store.json");
          if (!fs.existsSync(DATA_FILE)) continue;
          
          let state;
          try {
            const stateRaw = fs.readFileSync(DATA_FILE, "utf-8");
            state = JSON.parse(stateRaw);
          } catch (e) {
            console.error("Error reading data-store.json inside messages.upsert handler:", e);
            continue;
          }
          
          const workers = state.workers || [];
          
          // Normalize phone function
          const normalizePhone = (p: string) => p.replace(/[^0-9]/g, "");
          const cleanSenderPhone = normalizePhone(senderPhone);
          
          const worker = workers.find((w: any) => {
            if (!w.phoneNumber) return false;
            let wp = normalizePhone(w.phoneNumber);
            if (wp.startsWith("0")) wp = "62" + wp.slice(1);
            if (wp.startsWith("8")) wp = "62" + wp;
            return wp === cleanSenderPhone && w.isActive;
          });
          
          if (!worker) {
            continue;
          }
          
          // Get current date in Jakarta timezone (YYYY-MM-DD)
          const getJakartaDate = () => {
            const d = new Date();
            const formatter = new Intl.DateTimeFormat("id-ID", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            });
            const parts = formatter.formatToParts(d);
            const day = parts.find(p => p.type === "day")?.value || "01";
            const month = parts.find(p => p.type === "month")?.value || "01";
            const year = parts.find(p => p.type === "year")?.value || "2026";
            return `${year}-${month}-${day}`;
          };
          
          const todayDate = getJakartaDate();
          const workerName = worker.name;
          const workerId = worker.id;

          // Check if worker already completed attendance today
          const records = state.attendanceRecords || [];
          const matchedRecord = records.find((r: any) => r.workerId === workerId);
          const hasAttendanceToday = matchedRecord && matchedRecord.attendance && matchedRecord.attendance[todayDate] !== undefined;
          const currentStatusToday = matchedRecord && matchedRecord.customStatus && matchedRecord.customStatus[todayDate];
          const isCheckedInToday = hasAttendanceToday && (matchedRecord.attendance[todayDate] === true || !!currentStatusToday);
          
          // Extract text and location
          const messageText = (
            msg.message?.conversation || 
            msg.message?.extendedTextMessage?.text || 
            ""
          ).trim();
          
          const isLocation = !!msg.message?.locationMessage;
          
          if (isLocation) {
            const location = msg.message.locationMessage;
            const lat = location.degreesLatitude;
            const lon = location.degreesLongitude;
            
            // Calculate distance to office
            const OFFICE_LAT = -6.244342;
            const OFFICE_LON = 106.843073;
            const MAX_DISTANCE_METERS = 150;
            
            const R = 6371e3; // metres
            const phi1 = (lat * Math.PI) / 180;
            const phi2 = (OFFICE_LAT * Math.PI) / 180;
            const deltaPhi = ((OFFICE_LAT - lat) * Math.PI) / 180;
            const deltaLambda = ((OFFICE_LON - lon) * Math.PI) / 180;
            const a =
              Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c; // in meters
            
            if (distance <= MAX_DISTANCE_METERS) {
              // Within range! Register "Hadir" automatically
              let recordUpdated = false;
              for (const r of records) {
                if (r.workerId === workerId) {
                  if (!r.attendance) r.attendance = {};
                  r.attendance[todayDate] = true;
                  // Clear any previous custom status for today
                  if (r.customStatus && r.customStatus[todayDate]) {
                    delete r.customStatus[todayDate];
                  }
                  if (r.reasons && r.reasons[todayDate]) {
                    delete r.reasons[todayDate];
                  }
                  recordUpdated = true;
                  break;
                }
              }
              if (!recordUpdated) {
                records.push({
                  workerId,
                  attendance: { [todayDate]: true },
                  dailyAllowance: 25000
                });
              }
              
              // Add to logs
              const now = new Date();
              const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              if (!state.attendanceLogs) state.attendanceLogs = [];
              state.attendanceLogs.unshift({
                id: "LOG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
                workerId,
                workerName,
                date: todayDate,
                time: timeStr,
                latitude: lat,
                longitude: lon,
                distance: Math.round(distance),
                address: `Absen via WhatsApp Bot (Share Location)`,
                status: "BERHASIL"
              });
              if (state.attendanceLogs.length > 500) {
                state.attendanceLogs = state.attendanceLogs.slice(0, 500);
              }
              
              state.attendanceRecords = records;
              fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
              
              const responseText = `✅ *Absen Kehadiran Diterima!*
              
Halo *${workerName}*, presensi kehadiran (Hadir) Anda hari ini tanggal *${todayDate}* berhasil dicatat secara otomatis karena lokasi Anda berada di jangkauan kantor (jarak: *${Math.round(distance)}* meter dari kantor).

Selamat bekerja! 💼`;
              await sock.sendMessage(senderJid, { text: responseText });
            } else {
              // Outside of range! Warn and offer options
              const responseText = `⚠️ *Absen Kehadiran Ditolak!*

Halo *${workerName}*, Anda terdeteksi berada di luar jangkauan area kantor (jarak: *${Math.round(distance)}* meter, batas maksimal *150* meter).

Silakan pilih alasan ketidakhadiran Anda hari ini dengan membalas pesan ini menggunakan angka atau kata kunci di bawah:
1️⃣ *Sakit* (Ketik: *Sakit*)
2️⃣ *Izin* (Ketik: *Izin*)
3️⃣ *Cuti* (Ketik: *Cuti*)
4️⃣ *Meeting* (Ketik: *Meeting*)
5️⃣ *Absen* (Ketik: *Absen* / Alpa)`;
              await sock.sendMessage(senderJid, { text: responseText });
            }
          } else if (messageText) {
            const cleanMsg = messageText.toLowerCase().trim();
            const isMenuKeyword = cleanMsg === "menu" || cleanMsg === "bantuan" || cleanMsg === "help";
            
            // Extract selected status first to see if they are trying to set/change a status
            let selectedStatus: string | null = null;
            if (cleanMsg === "1" || cleanMsg === "sakit" || (cleanMsg.includes("sakit") && cleanMsg.length < 15)) {
              selectedStatus = "Sakit";
            } else if (cleanMsg === "2" || cleanMsg === "izin" || (cleanMsg.includes("izin") && cleanMsg.length < 15)) {
              selectedStatus = "Izin";
            } else if (cleanMsg === "3" || cleanMsg === "cuti" || (cleanMsg.includes("cuti") && cleanMsg.length < 15)) {
              selectedStatus = "Cuti";
            } else if (cleanMsg === "4" || cleanMsg === "meeting" || (cleanMsg.includes("meeting") && cleanMsg.length < 15)) {
              selectedStatus = "Meeting";
            } else if (cleanMsg === "5" || cleanMsg === "absen" || cleanMsg === "alpa" || (cleanMsg.includes("absen") && cleanMsg.length < 15)) {
              selectedStatus = "Absen";
            }

            const isPresentToday = matchedRecord && matchedRecord.attendance && matchedRecord.attendance[todayDate] === true;
            
            // If they are already checked in as "Hadir" (Present) today, completely ignore normal texts
            // so they can chat with the admin/staff about work things normally.
            if (isPresentToday && !isMenuKeyword) {
              continue;
            }

            // If they already have a custom status set (like Sakit/Izin), we ignore normal chats.
            // But if they sent an explicit, strict option or status keyword, we let them overwrite/correct it!
            if (isCheckedInToday && !selectedStatus && !isMenuKeyword) {
              // Silent skip, let admin and worker chat about work naturally
              continue;
            }
            
            if (selectedStatus) {
              let recordUpdated = false;
              for (const r of records) {
                if (r.workerId === workerId) {
                  if (!r.attendance) r.attendance = {};
                  r.attendance[todayDate] = false; // Not present
                  
                  if (!r.customStatus) r.customStatus = {};
                  r.customStatus[todayDate] = selectedStatus;
                  
                  if (!r.reasons) r.reasons = {};
                  r.reasons[todayDate] = `Dipilih via WhatsApp Bot`;
                  
                  recordUpdated = true;
                  break;
                }
              }
              if (!recordUpdated) {
                records.push({
                  workerId,
                  attendance: { [todayDate]: false },
                  customStatus: { [todayDate]: selectedStatus },
                  reasons: { [todayDate]: `Dipilih via WhatsApp Bot` },
                  dailyAllowance: 25000
                });
              }
              
              // Add log
              const now = new Date();
              const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              if (!state.attendanceLogs) state.attendanceLogs = [];
              state.attendanceLogs.unshift({
                id: "LOG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
                workerId,
                workerName,
                date: todayDate,
                time: timeStr,
                latitude: 0,
                longitude: 0,
                distance: 0,
                address: `Absen status ${selectedStatus} via WhatsApp Bot`,
                status: "BERHASIL"
              });
              if (state.attendanceLogs.length > 500) {
                state.attendanceLogs = state.attendanceLogs.slice(0, 500);
              }
              
              state.attendanceRecords = records;
              fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
              
              const responseText = `✅ *Status Absensi Tercatat!*

Halo *${workerName}*, status absensi Anda hari ini tanggal *${todayDate}* telah dicatat sebagai *${selectedStatus}* di sistem admin. 

💡 *Salah pilih / Tidak sengaja?*
Jika Anda tidak sengaja mengirimkan nomor/status ini, Anda dapat memperbaikinya kapan saja sebelum jam kerja berakhir dengan:
📍 **Kirimkan lokasi aktif Anda (Share Location)** sekarang untuk mengubah status menjadi *Hadir*, atau ketik angka/status pilihan lainnya jika ingin mengganti status.`;
              await sock.sendMessage(senderJid, { text: responseText });
            } else if (
              cleanMsg === "absen" || 
              cleanMsg === "hadir" || 
              cleanMsg === "halo" || 
              cleanMsg === "pagi" || 
              cleanMsg === "siang" || 
              cleanMsg === "ping" || 
              cleanMsg === "bot" ||
              isMenuKeyword
            ) {
              // Send a help menu
              const responseText = `Halo *${workerName}*! 👋

Silakan pilih cara melakukan absensi hari ini:
1️⃣ *Kirimkan Lokasi Aktif Anda (Share Location)* melalui WhatsApp ini untuk absen Hadir langsung di kantor.
2️⃣ Atau ketik angka/status di bawah jika berhalangan hadir:
   👉 *Sakit*
   👉 *Izin*
   👉 *Cuti*
   👉 *Meeting*
   👉 *Absen* (Alpa)

_Catatan: Jika Anda ingin melakukan absensi normal dengan tanda tangan & foto, silakan klik link absensi harian yang dikirim sebelumnya._`;
              await sock.sendMessage(senderJid, { text: responseText });
            }
          }
        }
      } catch (err) {
        console.error("Error processing message upsert inside WA Bot:", err);
      }
    });

    // Handle connection updates
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = "qr";
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr);
        } catch (err: any) {
          console.error("Failed to generate QR data URL", err);
          qrCodeDataUrl = null;
        }
      }

      if (connection === "open") {
        connectionStatus = "connected";
        qrCodeDataUrl = null;
        const user = sock?.user;
        connectedUser = user ? { id: user.id, name: user.name || "Admin WhatsApp" } : { id: "unknown" };
        console.log("WhatsApp connection successfully opened for", connectedUser);
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`WhatsApp connection closed. Status Code: ${statusCode}, Reconnecting: ${shouldReconnect}`);
        
        connectedUser = null;
        qrCodeDataUrl = null;

        if (shouldReconnect) {
          connectionStatus = "connecting";
          setTimeout(() => {
            initWhatsApp();
          }, 5000);
        } else {
          connectionStatus = "disconnected";
          lastError = "Logged out of WhatsApp. Please scan QR Code again.";
          cleanupAuthFolder();
        }
      }
    });

    return sock;
  } catch (err: any) {
    console.error("Error starting WhatsApp Baileys:", err);
    connectionStatus = "disconnected";
    lastError = err.message || "Failed to initialize WhatsApp connection.";
    return null;
  }
}

// Helper to clean up auth credentials folder
function cleanupAuthFolder() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      console.log("Cleared Baileys auth directory successfully.");
    }
  } catch (err) {
    console.error("Error clearing Baileys auth folder:", err);
  }
}

// Disconnect/Logout WhatsApp
export async function disconnectWhatsApp() {
  try {
    qrCodeDataUrl = null;
    connectedUser = null;
    
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        // ignore logout errors if socket is already dead
      }
      sock.end(undefined);
      sock = null;
    }
    
    connectionStatus = "disconnected";
    cleanupAuthFolder();
    
    // Trigger a fresh connection after 2 seconds to regenerate a clean QR code
    setTimeout(() => {
      initWhatsApp();
    }, 2000);

    return { success: true, message: "Logged out and reset successfully." };
  } catch (err: any) {
    console.error("Error during logout:", err);
    return { success: false, error: err.message };
  }
}

// Send Message helper with Anti-Spam Protections
export async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (connectionStatus !== "connected" || !sock) {
      throw new Error("WhatsApp bot is not connected.");
    }

    const jid = formatToWaJid(phoneNumber);
    console.log(`Sending WhatsApp message to ${jid}: ${text.slice(0, 40)}...`);
    
    // Enhanced Anti-Spam Simulation: Realistic human typing presence
    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate('composing', jid);
      // Realistic typing delay calculated based on message length with random jitter (2.5s - 5s)
      const baseDelay = Math.min(5000, Math.max(2500, text.length * 20));
      const typingJitter = Math.floor(Math.random() * 1500);
      await new Promise(r => setTimeout(r, baseDelay + typingJitter));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) {
      // ignore presence errors
    }

    await sock.sendMessage(jid, { text });

    // Anti-spam post-send jitter delay to prevent rapid-fire pattern detection by WhatsApp
    const postSendDelay = 3000 + Math.floor(Math.random() * 3000);
    await new Promise(r => setTimeout(r, postSendDelay));

    return { success: true };
  } catch (err: any) {
    console.error(`Failed to send WhatsApp message to ${phoneNumber}:`, err);
    return { success: false, error: err.message || "Unknown error" };
  }
}

// Request pairing code helper (Link via Phone Number)
export async function requestWhatsAppPairingCode(phone: string): Promise<string> {
  if (connectionStatus === "connected") {
    throw new Error("WhatsApp sudah terhubung. Sila putuskan koneksi terlebih dahulu.");
  }

  // Ensure socket is initialized and alive
  if (!sock) {
    await initWhatsApp();
  }

  if (!sock) {
    throw new Error("Gagal menginisialisasi server WhatsApp.");
  }

  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  }

  console.log(`Requesting pairing code for phone number: ${cleaned}`);
  try {
    const code = await sock.requestPairingCode(cleaned);
    return code;
  } catch (err: any) {
    console.error("Error requesting pairing code from Baileys:", err);
    throw new Error(err.message || "Gagal meminta kode pairing dari WhatsApp. Coba beberapa saat lagi atau putuskan koneksi dulu.");
  }
}

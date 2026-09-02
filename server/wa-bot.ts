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
3️⃣ 🤖 *Tanya AI Bisnis*: Anda juga dapat bertanya langsung seputar voucher transaksi, rekap petty cash, atau informasi operasional perusahaan!

_Catatan: Jika Anda ingin melakukan absensi normal dengan tanda tangan & foto, silakan klik link absensi harian yang dikirim sebelumnya._`;
              await sock.sendMessage(senderJid, { text: responseText });
            } else {
              // Route to Gemini AI Knowledge for business/transaction queries
              await handleBusinessAiQuery(messageText, senderJid, workerName);
            }
          } else if (messageText && !worker) {
            // General query from an unlisted number or admin
            await handleBusinessAiQuery(messageText, senderJid);
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

/**
 * Helper to normalize Indonesian phone numbers for comparison
 */
export function normalizePhoneNumber(phone: string): string {
  let clean = phone.replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}

// Helper to get Jakarta date string (YYYY-MM-DD)
export function getJakartaDateStr(): string {
  const d = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

// Indonesian Month Matching Map for fast multi-period resolution
const MONTH_MAP: Record<string, { num: string; name: string; roman: string }> = {
  "januari": { num: "01", name: "Januari", roman: "I" },
  "jan": { num: "01", name: "Januari", roman: "I" },
  "februari": { num: "02", name: "Februari", roman: "II" },
  "feb": { num: "02", name: "Februari", roman: "II" },
  "maret": { num: "03", name: "Maret", roman: "III" },
  "mar": { num: "03", name: "Maret", roman: "III" },
  "april": { num: "04", name: "April", roman: "IV" },
  "apr": { num: "04", name: "April", roman: "IV" },
  "mei": { num: "05", name: "Mei", roman: "V" },
  "may": { num: "05", name: "Mei", roman: "V" },
  "juni": { num: "06", name: "Juni", roman: "VI" },
  "jun": { num: "06", name: "Juni", roman: "VI" },
  "june": { num: "06", name: "Juni", roman: "VI" },
  "juli": { num: "07", name: "Juli", roman: "VII" },
  "jul": { num: "07", name: "Juli", roman: "VII" },
  "july": { num: "07", name: "Juli", roman: "VII" },
  "agustus": { num: "08", name: "Agustus", roman: "VIII" },
  "ags": { num: "08", name: "Agustus", roman: "VIII" },
  "agt": { num: "08", name: "Agustus", roman: "VIII" },
  "august": { num: "08", name: "Agustus", roman: "VIII" },
  "aug": { num: "08", name: "Agustus", roman: "VIII" },
  "september": { num: "09", name: "September", roman: "IX" },
  "sep": { num: "09", name: "September", roman: "IX" },
  "sept": { num: "09", name: "September", roman: "IX" },
  "oktober": { num: "10", name: "Oktober", roman: "X" },
  "okt": { num: "10", name: "Oktober", roman: "X" },
  "oct": { num: "10", name: "Oktober", roman: "X" },
  "november": { num: "11", name: "November", roman: "XI" },
  "nov": { num: "11", name: "November", roman: "XI" },
  "desember": { num: "12", name: "Desember", roman: "XII" },
  "des": { num: "12", name: "Desember", roman: "XII" },
  "dec": { num: "12", name: "Desember", roman: "XII" }
};

/**
 * Core AI Business Knowledge engine powered by Gemini
 */
export async function generateBusinessAiReply(userQuery: string, senderName?: string, senderPhoneOrJid?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return `🤖 *Asisten AI PT NMSA*\n\nTerima kasih atas pesan Anda: "${userQuery}".\n\nUntuk mengaktifkan fitur tanya-jawab otomatis seputar voucher, data keuangan, dan absensi karyawan secara langsung melalui WhatsApp, pastikan kunci API AI telah aktif di pengaturan server.`;
  }

  // Load available data store
  const DATA_FILE = path.join(process.cwd(), "data-store.json");
  let stateData: any = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      stateData = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch (e) {}
  }

  // Extract security settings
  const secSettings = stateData.waSecuritySettings || {
    privacyMode: "whitelist", // 'whitelist' | 'pin' | 'public'
    allowedPhones: [],
    securityPin: "1234",
    enableDriveLinks: true,
    unauthorizedMessage: "Nomor WhatsApp Anda belum terdaftar dalam otorisasi akses data keuangan PT NMSA. Silakan hubungi Finance/Admin untuk mendaftarkan nomor Anda."
  };

  const qLower = userQuery.toLowerCase();

  // Determine if query is requesting sensitive voucher or financial transaction data
  const isFinancialQuery = (
    qLower.includes("voucher") ||
    qLower.includes("bkk") ||
    qLower.includes("transaksi") ||
    qLower.includes("bayar") ||
    qLower.includes("lunas") ||
    qLower.includes("belum bayar") ||
    qLower.includes("nominal") ||
    qLower.includes("biaya") ||
    qLower.includes("pengeluaran") ||
    qLower.includes("kas kecil") ||
    qLower.includes("petty cash") ||
    qLower.includes("dana") ||
    qLower.includes("uang") ||
    qLower.includes("ho-") ||
    qLower.includes("solar") ||
    qLower.includes("bbm") ||
    qLower.includes("invoice") ||
    qLower.includes("rekening") ||
    qLower.includes("drive") ||
    qLower.includes("file") ||
    qLower.includes("lampiran") ||
    qLower.includes("dokumen") ||
    qLower.includes("sppd") ||
    qLower.includes("gaji") ||
    qLower.includes("rp")
  );

  // Normalize sender phone
  let cleanSenderPhone = "";
  if (senderPhoneOrJid) {
    const rawNumber = senderPhoneOrJid.split("@")[0].split(":")[0];
    cleanSenderPhone = normalizePhoneNumber(rawNumber);
  }

  // Check admin / authorized status
  const connectedAdminId = connectedUser?.id ? normalizePhoneNumber(connectedUser.id.split("@")[0].split(":")[0]) : "";
  const allowedList = (secSettings.allowedPhones || []).map((p: string) => normalizePhoneNumber(p));
  
  // Also check if sender is registered as an Admin/Finance worker
  const isWorkerAdmin = (stateData.workers || []).some((w: any) => {
    if (!w.phoneNumber || !w.isActive) return false;
    const pNorm = normalizePhoneNumber(w.phoneNumber);
    const roleLower = (w.role || "").toLowerCase();
    const isAdminRole = roleLower.includes("admin") || roleLower.includes("finance") || roleLower.includes("direktur") || roleLower.includes("manager") || roleLower.includes("keuangan") || roleLower.includes("accounting");
    return pNorm === cleanSenderPhone && isAdminRole;
  });

  const isSenderAdmin = (
    senderPhoneOrJid === "admin_ui" ||
    senderPhoneOrJid === "Pengguna WhatsApp" || // Sandbox / direct test
    (cleanSenderPhone && (cleanSenderPhone === connectedAdminId || allowedList.includes(cleanSenderPhone) || isWorkerAdmin))
  );

  // Check PIN in query if mode is PIN
  const pinPattern = /#pin\s*([0-9a-zA-Z]+)|pin\s*:\s*([0-9a-zA-Z]+)/i;
  const pinMatch = userQuery.match(pinPattern);
  const providedPin = pinMatch ? (pinMatch[1] || pinMatch[2]) : "";
  const isPinValid = providedPin && String(providedPin).trim() === String(secSettings.securityPin || "1234").trim();

  // Access Control enforcement for sensitive financial queries
  if (isFinancialQuery) {
    if (secSettings.privacyMode === "whitelist" && !isSenderAdmin) {
      return `🔒 *Akses Data Transaksi Terbatas (Privasi Terjaga)*\n\nHalo *${senderName || 'Bapak/Ibu'}*,\n\n${secSettings.unauthorizedMessage || 'Nomor WhatsApp Anda belum terdaftar dalam otorisasi akses voucher keuangan PT NMSA.'}\n\n📱 Nomor Anda: *+${cleanSenderPhone || 'Tidak terdeteksi'}*\n\n💡 *Untuk Mendaftarkan Nomor:* Hubungi Tim Finance / Admin PT NMSA untuk menambahkan nomor Anda ke daftar otorisasi WhatsApp AI.`;
    }

    if (secSettings.privacyMode === "pin" && !isSenderAdmin && !isPinValid) {
      return `🔐 *Otorisasi PIN Keamanan Diperlukan*\n\nUntuk melihat rincian voucher transaksi & data keuangan PT NMSA, silakan sertakan PIN Otorisasi Anda dalam pesan.\n\nContoh format:\n👉 *${userQuery} #PIN${secSettings.securityPin || '1234'}*\n\nAtau ketik PIN Anda untuk membuka akses.`;
    }
  }

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" }
    }
  });

  // Current Jakarta Date & Time (WIB)
  const todayYMD = getJakartaDateStr();
  const jktTimeNow = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });

  // 1. Process Workers & Attendance Data
  const rawWorkers = stateData.workers || [];
  const rawAttendance = stateData.attendanceRecords || [];

  const todayPresentWorkerIds = new Set<string>();
  const attendanceSummaries = rawWorkers.map((w: any) => {
    const record = rawAttendance.find((r: any) => r.workerId === w.id);
    const attMap: Record<string, boolean> = record?.attendance || {};
    const dailyAllowance = Number(record?.dailyAllowance) || 25000;

    // Filter dates where worker is present
    const presentDates = Object.keys(attMap).filter(d => attMap[d] === true);
    const totalPresentDays = presentDates.length;
    const isPresentToday = attMap[todayYMD] === true;
    if (isPresentToday) {
      todayPresentWorkerIds.add(w.id);
    }

    // Monthly attendance breakdown (e.g. "2026-05": 10 days, "2026-06": 20 days, "2026-07": 22 days, "2026-08": 24 days)
    const monthlyCount: Record<string, number> = {};
    presentDates.forEach(d => {
      const monthKey = d.substring(0, 7); // "YYYY-MM"
      monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
    });

    const totalUangMakan = totalPresentDays * dailyAllowance;

    return {
      id: w.id,
      nama: w.name,
      posisi: w.role || "Karyawan Lapangan/HO",
      noHp: w.phoneNumber || "-",
      statusKaryawan: w.isActive ? "Aktif" : "Nonaktif",
      hadirHariIni: isPresentToday ? "HADIR (Sudah Absen)" : "BELUM ABSEN",
      totalHariHadirSemuaPeriode: totalPresentDays,
      tarifUangMakanHarian: dailyAllowance,
      totalUangMakanAkumulasi: totalUangMakan,
      kehadiranPerBulan: monthlyCount,
      tanggalHadirTerakhir: presentDates.sort().slice(-5)
    };
  });

  const activeWorkersList = attendanceSummaries.filter((w: any) => w.statusKaryawan === "Aktif");
  const workersPresentToday = activeWorkersList.filter((w: any) => todayPresentWorkerIds.has(w.id));
  const workersAbsentToday = activeWorkersList.filter((w: any) => !todayPresentWorkerIds.has(w.id));

  // 2. Process All Submissions and Petty Cash Reports Across All Months
  const allSubmissions = stateData.submissions || [];
  const pettyCashReports = stateData.pettyCashReports || [];
  const sppdRecords = stateData.sppdRecords || [];
  const npwpRecords = stateData.npwpRecords || [];
  const agendaItems = stateData.agendaItems || [];
  const accurateAccounts = stateData.accurateAccounts || [];
  const accurateMappedReports = stateData.accurateMappedReports || [];
  const auditLogs = stateData.auditLogs || [];
  const companySettings = stateData.companySettings || {};

  // Integrate Petty Cash Reports into comprehensive transaction list
  const consolidatedTransactions: any[] = [];

  // A. From submissions
  allSubmissions.forEach((s: any) => {
    const items = (s.items || []).map((it: any) => ({
      no: it.no || 1,
      item: it.item || it.uraian || it.keterangan || "Item Pengeluaran",
      volume: it.jumlahVolume || it.volume || it.qty || "1",
      total: Number(it.total) || Number(it.nominal) || 0,
      keterangan: it.keterangan || ""
    }));
    const totalAmount = Number(s.totalAmount) || Number(s.nominal) || (items.length > 0 ? items.reduce((acc: number, cur: any) => acc + (Number(cur.total) || 0), 0) : 0);
    
    const driveUrl = s.googleDriveFileUrl || (s.googleDriveFiles && s.googleDriveFiles[0]?.url) || (s.buktiPembayaran?.url) || (s.pettyCashFile?.url) || null;
    const driveFileName = s.googleDriveFileName || (s.googleDriveFiles && s.googleDriveFiles[0]?.name) || (s.buktiPembayaran?.name) || "Dokumen_Voucher_Lengkap.pdf";
    const allDriveFiles = (s.googleDriveFiles || []).map((f: any) => ({ 
      nama: f.name || "Lampiran", 
      link: f.url, 
      kategori: f.isF1 ? "Voucher F1" : f.isF2 ? "Bukti Bayar F2" : "Lampiran Nota/Invoice" 
    }));

    const isPaid = (
      (s.statusPembayaran && s.statusPembayaran.toUpperCase().includes("SUDAH")) ||
      (s.status && (s.status.toUpperCase() === "LUNAS" || s.status.toUpperCase() === "PAID")) ||
      s.isPaid === true
    );

    consolidatedTransactions.push({
      source: "voucher_pengajuan",
      id: s.id,
      kodeVoucher: s.kode || s.id || s.noVoucher || "BKK-HO",
      lokasi: s.lokasi || "HO Jakarta / Site",
      tanggal: s.tanggal || "2026-08-01",
      bulan: s.tanggal ? s.tanggal.substring(0, 7) : "2026-08",
      jenisPengajuan: s.jenisPengajuan || s.kategori || "Operasional Kantor",
      perihal: s.perihal || s.notes || s.keterangan || "Pengeluaran Operasional PT NMSA",
      dibayarkanKepada: s.dibayarkanKepada || s.kepada || s.namaPenerima || "Penerima Dana",
      dibayarkanDengan: s.dibayarkanDengan || s.metodePembayaran || "Transfer Bank / Kas Tunai",
      totalNominal: totalAmount,
      statusPembayaran: isPaid ? "SUDAH DIBAYAR (LUNAS)" : "BELUM DIBAYAR (PENDING)",
      isPaid: isPaid,
      rincianItems: items,
      linkDokumenGoogleDrive: driveUrl,
      namaFileGoogleDrive: driveFileName,
      daftarLampiranLengkap: allDriveFiles,
      diajukanOleh: s.dibuatOleh || s.diajukanOleh || "Nur Wahyudi",
      diverifikasiOleh: s.diverifikasiOleh ? `${s.diverifikasiOleh} (${s.diverifikasiJabatan || 'Keuangan'})` : "Andi Dhiya Salsabila (Keuangan)",
      disetujuiOleh: s.disetujuiOleh2 ? `${s.disetujuiOleh2} (${s.disetujuiJabatan2 || 'Direktur Utama'})` : (s.disetujuiOleh || "Harijon (Direksi)"),
      dibukukanOleh: s.dibukukanOleh ? `${s.dibukukanOleh} (${s.dibukukanJabatan || 'Accounting'})` : "Sri Ekowati (Accounting)",
      isPettyCash: s.isPettyCash || false,
      pettyCashCustodian: s.pettyCashCustodian || "",
      accurateMapping: s.accurateKasAccountCode ? { akunKas: s.accurateKasAccountCode, laporan: s.accurateReportTitle } : null
    });
  });

  // B. From pettyCashReports (handles May 2026, June 2026, July 2026, August 2026 historical reports)
  pettyCashReports.forEach((pcr: any) => {
    const reportMonth = pcr.summary?.reportMonth || (pcr.uploadedAt ? pcr.uploadedAt.substring(0, 7) : "2026-07");
    const custodian = pcr.summary?.workerName || pcr.workerName || "Pemegang Kas Kecil";
    const totalExp = Number(pcr.summary?.totalExpense) || (pcr.transactions ? pcr.transactions.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0) : 0);
    const subCode = pcr.submissionCode || pcr.id || `BKK-PC-${custodian.replace(/\s+/g, '')}`;

    const items = (pcr.transactions || []).map((tx: any, idx: number) => ({
      no: idx + 1,
      item: tx.description || tx.kategori || "Transaksi Kas Kecil",
      volume: "1",
      total: Number(tx.amount) || 0,
      keterangan: `Tanggal: ${tx.date || pcr.uploadedAt || ''}, Kategori: ${tx.category || 'Kas Kecil'}, Oleh: ${tx.worker || custodian}`
    }));

    // If not already in consolidated list by submissionCode or submissionId
    const exists = consolidatedTransactions.some(c => c.kodeVoucher === subCode || c.id === pcr.submissionId || c.id === pcr.id);
    if (!exists) {
      consolidatedTransactions.push({
        source: "laporan_petty_cash",
        id: pcr.id,
        kodeVoucher: subCode,
        lokasi: "Site Tambang / Lapangan",
        tanggal: pcr.uploadedAt || `${reportMonth}-01`,
        bulan: reportMonth,
        jenisPengajuan: "Petty Cash Lapangan / Kantor",
        perihal: pcr.fileName ? pcr.fileName.replace('.pdf', '') : `Petty Cash Periode ${reportMonth} (${custodian})`,
        dibayarkanKepada: custodian,
        dibayarkanDengan: "Kas Kecil / Petty Cash",
        totalNominal: totalExp,
        statusPembayaran: "SUDAH DIBAYAR (LUNAS)",
        isPaid: true,
        rincianItems: items,
        linkDokumenGoogleDrive: pcr.driveUrl || null,
        namaFileGoogleDrive: pcr.fileName || "Laporan_Petty_Cash.pdf",
        daftarLampiranLengkap: pcr.driveUrl ? [{ nama: pcr.fileName || "Laporan Petty Cash PDF", link: pcr.driveUrl, kategori: "Laporan Kas Kecil" }] : [],
        diajukanOleh: custodian,
        diverifikasiOleh: "Andi Dhiya Salsabila (Keuangan)",
        disetujuiOleh: "Harijon (Direksi) / H. A. Nursyam Halid (Direktur Utama)",
        dibukukanOleh: "Sri Ekowati (Accounting)",
        isPettyCash: true,
        pettyCashCustodian: custodian,
        summaryPettyCash: {
          saldoAwal: Number(pcr.summary?.totalIncome || 0),
          totalPengeluaran: totalExp,
          sisaSaldo: Number(pcr.summary?.remainingBalance || 0)
        }
      });
    }
  });

  // Calculate Monthly Statistics
  const monthlyStats: Record<string, { count: number; totalNominal: number; custodians: Set<string>; paidCount: number; unpaidCount: number }> = {};
  consolidatedTransactions.forEach(t => {
    const m = t.bulan || (t.tanggal ? t.tanggal.substring(0, 7) : "Lainnya");
    if (!monthlyStats[m]) {
      monthlyStats[m] = { count: 0, totalNominal: 0, custodians: new Set(), paidCount: 0, unpaidCount: 0 };
    }
    monthlyStats[m].count += 1;
    monthlyStats[m].totalNominal += Number(t.totalNominal) || 0;
    if (t.dibayarkanKepada) monthlyStats[m].custodians.add(t.dibayarkanKepada);
    if (t.isPaid) monthlyStats[m].paidCount += 1;
    else monthlyStats[m].unpaidCount += 1;
  });

  const monthlyCatalogFormatted = Object.keys(monthlyStats).sort().map(m => ({
    periode: m,
    namaBulan: formatMonthKeyToName(m),
    jumlahTransaksi: monthlyStats[m].count,
    totalNominal: `Rp ${monthlyStats[m].totalNominal.toLocaleString('id-ID')}`,
    totalNominalAngka: monthlyStats[m].totalNominal,
    lunas: monthlyStats[m].paidCount,
    pending: monthlyStats[m].unpaidCount,
    pihakTerkait: Array.from(monthlyStats[m].custodians).slice(0, 10)
  }));

  // Detect specific month requested by user in query (e.g. "Mei", "Juni", "Juli", "Agustus", "05", "2026-05", dsb.)
  let requestedMonthCode: string | null = null;
  for (const [mWord, mInfo] of Object.entries(MONTH_MAP)) {
    const regex = new RegExp(`\\b${mWord}\\b`, "i");
    if (regex.test(qLower) || qLower.includes(mWord)) {
      requestedMonthCode = mInfo.num;
      break;
    }
  }

  // Smart Context Selection - Provide Full Transactions Index & Deep details
  // Because Gemini 2.5 context window is massive, we can send ALL transactions if < 300, or deep items
  const allTransactionsFormatted = consolidatedTransactions.map(t => ({
    id: t.id,
    kode: t.kodeVoucher,
    tanggal: t.tanggal,
    bulan: t.bulan,
    penerima: t.dibayarkanKepada,
    perihal: t.perihal,
    kategori: t.jenisPengajuan,
    metode: t.dibayarkanDengan,
    nominal: t.totalNominal,
    nominalFormatted: `Rp ${Number(t.totalNominal).toLocaleString('id-ID')}`,
    status: t.statusPembayaran,
    isPaid: t.isPaid,
    diajukanOleh: t.diajukanOleh,
    disetujuiOleh: t.disetujuiOleh,
    linkDrive: t.linkDokumenGoogleDrive,
    lampiran: t.daftarLampiranLengkap,
    items: t.rincianItems
  }));

  // Process 3. Master NPWP & Vendor
  const npwpSummary = (npwpRecords || []).map((n: any) => ({
    id: n.id,
    namaPerusahaanOrVendor: n.nama || n.namaPerusahaan || n.name || "Vendor",
    npwp: n.npwp || "-",
    namaBank: n.bank || n.namaBank || "-",
    nomorRekening: n.noRekening || n.rekening || "-",
    atasNamaRekening: n.atasNama || n.namaPemilikRekening || "-",
    alamat: n.alamat || "-",
    kategori: n.kategori || "Supplier / Rekanan",
    statusPKP: n.pkp ? "PKP (Pengusaha Kena Pajak)" : "Non-PKP",
    catatan: n.catatan || ""
  }));

  // Process 4. Pemetaan Akun Accurate ERP
  const accurateAccountsSummary = (accurateAccounts && accurateAccounts.length > 0 ? accurateAccounts : [
    { code: "5-1100", name: "Biaya Bahan Bakar Minyak (BBM)", category: "Biaya Operasional", keywords: "solar, bbm, pertalite, dexlite, bensin, spbu, industri" },
    { code: "5-1200", name: "Biaya Perjalanan Dinas & SPPD", category: "Biaya Operasional", keywords: "sppd, tiket, pesawat, hotel, penginapan, uang saku dinas, travel, taksi" },
    { code: "5-1300", name: "Biaya Konsumsi & Dapur", category: "Biaya Operasional", keywords: "makan, beras, galon, dapur, kopi, gula, snack, konsumsi, aqua, catering" },
    { code: "5-1400", name: "Biaya ATK & Fotocopy", category: "Biaya Operasional", keywords: "atk, kertas, pulpen, materai, cetak, fotocopy, jilid, binder, printer" },
    { code: "5-1500", name: "Biaya Service Kendaraan & Tambang", category: "Biaya Operasional", keywords: "service, oli, ban, bengkel, sparepart, cuci mobil, excavator, dump truck" },
    { code: "5-1600", name: "Biaya Parkir & Tol", category: "Biaya Operasional", keywords: "parkir, tol, e-toll, bandara" },
    { code: "5-1700", name: "Biaya Listrik, Air & Internet", category: "Biaya Operasional", keywords: "listrik, pln, token, air, pdam, wifi, indihome, internet, pulsa, kuota" },
    { code: "5-1800", name: "Biaya Kebersihan & Keamanan", category: "Biaya Operasional", keywords: "kebersihan, sampah, sapu, security, keamanan, retribusi" },
    { code: "5-1900", name: "Biaya Operasional Lain-lain", category: "Biaya Operasional", keywords: "lain-lain, operasional, unmapped, rupa-rupa" },
    { code: "1-1102", name: "Kas Kecil (Petty Cash Lapangan)", category: "Kas & Bank", keywords: "petty cash, kas kecil, kas lapangan, hasnawi, usmar, suryo, deasy" }
  ]);

  // Process 5. SPPD Dinas Records
  const sppdSummary = (sppdRecords || []).map((sp: any) => ({
    id: sp.id,
    noSppd: sp.noSppd || sp.nomorSppd || `SPPD/NMSA/${sp.id}`,
    namaPetugas: sp.namaPetugas || sp.namaKaryawan || sp.nama || "Petugas Lapangan",
    jabatan: sp.jabatan || "-",
    kotaAsal: sp.kotaAsal || "Kantor Pusat HO / Kendari",
    kotaTujuan: sp.kotaTujuan || sp.tujuan || "Site Tambang",
    tanggalBerangkat: sp.tanggalBerangkat || sp.tglBerangkat || "-",
    tanggalKembali: sp.tanggalKembali || sp.tglKembali || "-",
    durasiHari: sp.durasiHari || sp.jumlahHari || "1",
    maksudPerjalananDinas: sp.maksudPerjalanan || sp.tujuanTugas || sp.perihal || "Tugas Operasional",
    rincianBiaya: {
      tiketTransport: Number(sp.biayaTiket || sp.tiket || 0),
      penginapanHotel: Number(sp.biayaHotel || sp.hotel || 0),
      uangHarianSaku: Number(sp.uangHarian || sp.uangSaku || 0),
      transportLokal: Number(sp.transportLokal || 0),
      biayaLainnya: Number(sp.biayaLainnya || 0),
      totalBiayaSppd: Number(sp.totalBiaya || sp.totalNominal || 0)
    },
    totalBiayaFormatted: `Rp ${Number(sp.totalBiaya || sp.totalNominal || 0).toLocaleString('id-ID')}`,
    statusApproval: sp.status || sp.statusApproval || "Disetujui Direksi",
    pejabatPemberiPerintah: sp.pemberiPerintah || "Direktur Utama / Operasional"
  }));

  // Process 6. Agenda & Pengingat Kerja
  const agendaSummary = (agendaItems && agendaItems.length > 0 ? agendaItems : [
    { id: "AG-01", title: "Batas Akhir Lapor & Setor Pajak PPh 21 Bulanan", category: "pajak", dueDate: "Setiap Tanggal 20", priority: "tinggi", completed: false, notes: "Setor dan lapor SPT Masa PPh 21 karyawan" },
    { id: "AG-02", title: "Batas Lapor SPT Masa PPh 23 / Final", category: "pajak", dueDate: "Setiap Tanggal 20", priority: "tinggi", completed: false, notes: "Lapor pemotongan pajak jasa/sewa vendor" },
    { id: "AG-03", title: "Batas Akhir Setor & Lapor PPN Masa", category: "pajak", dueDate: "Akhir Bulan", priority: "tinggi", completed: false, notes: "Faktur pajak masukan & keluaran" },
    { id: "AG-04", title: "Jadwal Penggajian & Uang Makan Karyawan", category: "keuangan", dueDate: "Akhir Bulan (Tgl 28-30)", priority: "tinggi", completed: false, notes: "Rekap absensi & transfer payroll HO dan Lapangan" },
    { id: "AG-05", title: "Closing Petty Cash Bulanan Site & HO", category: "keuangan", dueDate: "Akhir Bulan", priority: "sedang", completed: false, notes: "Rekap laporan pengeluaran kas kecil Hasnawi, Usmar, Suryo, Deasy" },
    { id: "AG-06", title: "Rapat Evaluasi Operasional Tambang & PBM", category: "operasional", dueDate: "Awal Bulan", priority: "sedang", completed: false, notes: "Evaluasi kinerja produksi, logistik BBM solar, dan pengapalan" }
  ]).map((ag: any) => ({
    id: ag.id,
    judulAgenda: ag.title || ag.judul || "Agenda Kerja",
    kategori: ag.category || ag.kategori || "umum",
    tanggalJatuhTempo: ag.dueDate || ag.tanggal || "-",
    prioritas: ag.priority || ag.prioritas || "sedang",
    status: ag.completed ? "Selesai" : "Pending / Akan Datang",
    catatan: ag.notes || ag.deskripsi || ""
  }));

  // Process 7. Petty Cash Custodian Balances
  const pettyCashCustodiansSummary = (stateData.pettyCashHolders || ["Suryo Pranoto", "Hasnawi", "Usmar", "Deasy"]).map((name: string) => {
    const matchingReports = pettyCashReports.filter((p: any) => (p.summary?.workerName || p.workerName || '').toLowerCase().includes(name.toLowerCase()));
    const matchingSubmissions = allSubmissions.filter((s: any) => (s.dibayarkanKepada || '').toLowerCase().includes(name.toLowerCase()) || (s.pettyCashCustodian || '').toLowerCase().includes(name.toLowerCase()));
    const totalExpSub = matchingSubmissions.reduce((acc: number, s: any) => acc + (Number(s.totalAmount) || Number(s.nominal) || 0), 0);
    const totalExpRep = matchingReports.reduce((acc: number, p: any) => acc + (Number(p.summary?.totalExpense) || 0), 0);
    return {
      namaPemegang: name,
      jumlahDokumenLaporan: matchingReports.length,
      jumlahVoucherTerkait: matchingSubmissions.length,
      totalPengeluaranTercatat: `Rp ${(totalExpSub || totalExpRep).toLocaleString('id-ID')}`,
      periodeAktif: Array.from(new Set([...matchingReports.map((p: any) => p.summary?.reportMonth || ''), ...matchingSubmissions.map((s: any) => (s.tanggal || '').substring(0, 7))])).filter(Boolean)
    };
  });

  // Summary statistics for fast high-level queries
  const totalTransactionsCount = consolidatedTransactions.length;
  const totalNominalAll = consolidatedTransactions.reduce((acc, s) => acc + (Number(s.totalNominal) || 0), 0);
  const unpaidList = consolidatedTransactions.filter(s => !s.isPaid);
  const totalUnpaidNominal = unpaidList.reduce((acc, s) => acc + (Number(s.totalNominal) || 0), 0);
  const paidList = consolidatedTransactions.filter(s => s.isPaid);
  const totalPaidNominal = paidList.reduce((acc, s) => acc + (Number(s.totalNominal) || 0), 0);

  const systemPrompt = `Anda adalah Asisten AI Enterprise Resmi PT Nusantara Mineral Sukses Abadi (NMSA).
Anda bertindak sebagai rekan kerja senior yang menguasai 100% DETAIL KESELURUHAN SISTEM & DATA OPERASIONAL PERUSAHAAN dari 6 (ENAM) MENU APLIKASI UTAMA.

================================================================================
PROFIL PERUSAHAAN & STRUKTUR OPERASIONAL:
• Nama Perusahaan: PT Nusantara Mineral Sukses Abadi (NMSA)
• Bidang Usaha: Pertambangan Mineral (Nikel/Tambang), Jasa Maritim / Pelabuhan / PBM (Perusahaan Bongkar Muat), dan Operasional Kantor Pusat.
• Lokasi Kantor:
  - Kantor Pusat (HO): Jakarta
  - Kantor Operasional & Site: Kendari / Sulawesi Tenggara & Lokasi Tambang.
• Pejabat Penandatangan & Otoritas:
  - Direktur Utama: H. A. Nursyam Halid (Penyetuju Akhir / Otorisasi Utama)
  - Direksi: Harijon (Penyetuju Operasional)
  - Keuangan / Verifikator: Andi Dhiya Salsabila
  - Accounting / Pembukuan: Sri Ekowati
  - Staff Pembuat Pengajuan: Nur Wahyudi, Faisal Zainuddin, Deasy Annisa Syahdani, Addrian Firmansyah Zain
  - Pemegang Kas Kecil (Custodians): Hasnawi (Site/Lapangan), Usmar (Lapangan), Suryo Pranoto (Site/PBM), Deasy (HO)

================================================================================
STRUKTUR LENGKAP 6 MENU APLIKASI PT NMSA:

1. 💰 MENU 1: VOUCHER HO & MODE REKAP
   - Seluruh Voucher Pengajuan BKK (Bukti Kas Keluar) HO, Site, dan Petty Cash dari seluruh bulan (Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, dst).
   - Pengeluaran mencakup: BBM Solar Industri Tambang, Operasional PBM/Perkapalan, Gaji Karyawan, Biaya Notaris, Konsumsi, ATK, Service Kendaraan, dsb.
   - Status Pembayaran: SUDAH DIBAYAR (LUNAS) vs BELUM DIBAYAR (PENDING / KEWAJIBAN TERHUTANG).
   - 6 Mode Tampilan: Standar, Mode Spreadsheet, Riwayat Audit Log, Rekap Bukti Invoice/Faktur, Kewajiban Belum Bayar, dan Rekap Petty Cash.
   - Dokumen Digital: Lampiran Google Drive (F1 Form Pengajuan, F2 Bukti Transfer Bank / Kwitansi, Nota Invoice).

2. 👥 MENU 2: ABSEN HARIAN NMSA
   - Presensi karyawan real-time berbasis PIN Dinamis Harian (PIN Hari Ini: ${stateData.attendancePin || 'Tersedia di Server'}) & Foto Geolocation.
   - Data kehadiran hari ini (${todayYMD}): siapa yang SUDAH HADIR vs BELUM ABSEN.
   - Perhitungan Uang Makan Harian (Daily Allowance): Standar Rp 25.000/hari kehadiran atau nominal khusus karyawan.
   - Pengingat WhatsApp otomatis terjadwal pukul 09:00 WIB untuk karyawan yang belum absen.

3. 🏢 MENU 3: MASTER NPWP & VENDOR
   - Database master rekanan, supplier solar BBM, toko bengkel, rental alat, konsumsi, dan kontraktor.
   - Memuat: Nama Vendor, Nomor NPWP (15/16 digit), Status PKP, Nama Bank, Nomor Rekening, Nama Pemilik Rekening, Alamat, Kategori Usaha.

4. 📊 MENU 4: PEMETAAN AKUN (ACCURATE ERP)
   - Master Chart of Accounts (COA) Accurate ERP:
     * 5-1100 Biaya BBM (Solar, Pertalite, Dexlite, SPBU)
     * 5-1200 Biaya Perjalanan Dinas & SPPD (Tiket, Hotel, Uang Saku Dinas)
     * 5-1300 Biaya Konsumsi & Dapur (Beras, Galon Aqua, Kopi, Dapur, Catering)
     * 5-1400 Biaya ATK & Fotocopy (Kertas, Materai, Cetak, Pulpen)
     * 5-1500 Biaya Service Kendaraan & Tambang (Oli, Sparepart, Bengkel, Alat Berat)
     * 5-1600 Biaya Parkir & Tol
     * 5-1700 Biaya Listrik, Air & Internet (PLN, PDAM, Wifi Indihome, Pulsa)
     * 5-1800 Biaya Kebersihan & Keamanan
     * 5-1900 Biaya Operasional Lain-lain
     * 1-1102 Kas Kecil / Petty Cash Lapangan
   - Fitur pemetaan transaksi otomatis dan ekspor data ke Accurate Accounting.

5. 📑 MENU 5: FORMULIR & SPPD DINAS
   - Penerbitan Surat Perintah Perjalanan Dinas resmi (SPPD).
   - Memuat: Nomor SPPD, Nama Petugas, Jabatan, Kota Asal & Tujuan, Tanggal Dinas, Maksud Tugas, Rincian Anggaran (Tiket Pesawat/Kapal, Hotel/Penginapan, Uang Harian/Saku, Transport Lokal), Status Approval Direksi.

6. ⏰ MENU 6: PENGINGAT & AGENDA KERJA
   - Kalender pengingat agenda kerja rutin perusahaan:
     * Tanggal 20: Batas Lapor & Setor SPT Masa PPh 21 Karyawan & PPh 23
     * Akhir Bulan: Batas Lapor PPN Masa & Faktur Pajak
     * Akhir Bulan (Tgl 28-30): Jadwal Penggajian & Uang Makan Karyawan
     * Closing Petty Cash Site & HO bulanan
     * Reminder Jatuh Tempo Invoice Tagihan Vendor & Rapat Direksi.

================================================================================
WAKTU SERVER SAAT INI (JAKARTA / WIB):
- Hari & Tanggal Hari Ini: ${todayYMD} (Pukul ${jktTimeNow} WIB)

RINGKASAN METRIK DATABASE TERKINI:
• Total Voucher Tercatat: ${totalTransactionsCount} dokumen (Total Nilai: Rp ${totalNominalAll.toLocaleString('id-ID')})
• Voucher Lunas / Terbayar: ${paidList.length} transaksi (Total: Rp ${totalPaidNominal.toLocaleString('id-ID')})
• Voucher Belum Bayar (Pending): ${unpaidList.length} transaksi (Total: Rp ${totalUnpaidNominal.toLocaleString('id-ID')})
• Katalog Pengeluaran per Bulan:
${JSON.stringify(monthlyCatalogFormatted, null, 2)}
• Total Karyawan: ${rawWorkers.length} orang (${activeWorkersList.length} Aktif)
  - Sudah Absen Hari Ini: ${workersPresentToday.length} orang (${workersPresentToday.map(w => w.nama).join(', ') || 'Belum ada'})
  - Belum Absen Hari Ini: ${workersAbsentToday.length} orang (${workersAbsentToday.map(w => w.nama).join(', ') || 'Semua sudah hadir'})
• Pemegang Kas Kecil (Petty Cash):
${JSON.stringify(pettyCashCustodiansSummary, null, 2)}

================================================================================
DATABASE RINCIAN LENGKAP SEMUA MENU (SUMBER KEBENARAN UTAMA):

[DATA MENU 2: PRESENSI & REKAP UANG MAKAN SELURUH KARYAWAN]:
${JSON.stringify(attendanceSummaries, null, 2)}

[DATA MENU 1: SELURUH TRANSAKSI VOUCHER & KAS KECIL]:
${JSON.stringify(allTransactionsFormatted, null, 2)}

[DATA MENU 3: MASTER NPWP & REKENING REKANAN/VENDOR]:
${JSON.stringify(npwpSummary, null, 2)}

[DATA MENU 4: CHART OF ACCOUNTS ACCURATE ERP]:
${JSON.stringify(accurateAccountsSummary, null, 2)}

[DATA MENU 5: SURAT PERJALANAN DINAS (SPPD)]:
${JSON.stringify(sppdSummary, null, 2)}

[DATA MENU 6: AGENDA & JADWAL KERJA]:
${JSON.stringify(agendaSummary, null, 2)}

================================================================================
PANDUAN MENJAWAB (AKURAT, DETAIL, & PROFESIONAL):
1. FAKTAWI & TANPA HALUSINASI:
   - Gunakan data eksak di atas. Jangan mengarang nomor voucher, nominal uang, nama orang, nomor rekening, atau tanggal.
   - Format semua angka uang dalam format standar Rupiah Indonesia (contoh: *Rp 15.250.000*).

2. JIKA DITANYA TENTANG VOUCHER, KAS KECIL, ATAU KEUANGAN:
   - Sebutkan: Kode Voucher, Tanggal, Dibayarkan Kepada, Perihal, Nominal, Status Pembayaran (Lunas/Pending), dan sertakan Tautan Google Drive jika ada.
   - Jika ditanya tentang bulan tertentu (Mei, Juni, Juli, Agustus, April, dsb), jelaskan total nominal bulan tersebut dan rincian transaksi utamanya.

3. JIKA DITANYA TENTANG ABSENSI ATAU UANG MAKAN:
   - Jelaskan status hari ini (${todayYMD}): siapa yang sudah absen dan siapa yang belum.
   - Jika ditanya tentang nama karyawan tertentu, sebutkan total hari hadir, tarif uang makan harian, total akumulasi uang makan yang diperoleh, dan riwayat kehadiran per bulan.

4. JIKA DITANYA TENTANG VENDOR / REKENING / NPWP:
   - Berikan nama vendor, nomor NPWP, nama bank, nomor rekening, dan nama pemilik rekening secara akurat.

5. JIKA DITANYA TENTANG ACCURATE / COA / AKUNTANSI:
   - Jelaskan kode akun Accurate yang sesuai dengan kategori transaksi (misal BBM -> 5-1100, SPPD -> 5-1200, Dapur/Konsumsi -> 5-1300, Kas Kecil -> 1-1102).

6. JIKA DITANYA TENTANG SPPD DINAS:
   - Jelaskan nomor SPPD, nama petugas, kota asal dan tujuan, tanggal dinas, perihal tugas, dan total anggaran biaya perjalanan.

7. JIKA DITANYA TENTANG AGENDA / PAJAK / GAJI:
   - Jelaskan jadwal batas waktu pajak (PPh 21 tanggal 20, PPN akhir bulan), jadwal penggajian, dan status agenda tersebut.

8. JIKA DITANYA TENTANG FITUR APLIKASI ATAU BANTUAN KATA KUNCI:
   - Jelaskan ke-6 menu aplikasi secara terstruktur dan berikan contoh kata kunci pertanyaan yang dapat diajukan.

Gunakan format Markdown WhatsApp yang estetik dan rapi (*tebal*, •, ✅, ⏳, 📎, 👉, 📋) yang nyaman dibaca di smartphone.`;

  const modelsToTry = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-pro"
  ];

  let lastError: any = null;
  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt}\n\nPertanyaan dari ${senderName || 'Pengguna'}:\n"${userQuery}"` }
            ]
          }
        ]
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  // If Gemini API is rate-limited or unavailable on the project, engage our comprehensive enterprise NLP engine
  return generateDeterministicBusinessReply(
    userQuery,
    senderName,
    todayYMD,
    attendanceSummaries,
    workersPresentToday,
    workersAbsentToday,
    stateData.attendancePin || "Tersedia di Server",
    allTransactionsFormatted,
    monthlyCatalogFormatted,
    npwpSummary,
    accurateAccountsSummary,
    sppdSummary,
    agendaSummary,
    pettyCashCustodiansSummary,
    totalTransactionsCount,
    totalNominalAll,
    paidList,
    unpaidList,
    totalPaidNominal,
    totalUnpaidNominal
  );
}

/**
 * Intelligent deterministic enterprise knowledge engine covering all 6 menus
 */
function generateDeterministicBusinessReply(
  userQuery: string,
  senderName: string | undefined,
  todayYMD: string,
  attendanceSummaries: any[],
  workersPresentToday: any[],
  workersAbsentToday: any[],
  attendancePin: string,
  allTransactions: any[],
  monthlyCatalog: any[],
  npwpList: any[],
  accurateAccounts: any[],
  sppdList: any[],
  agendaList: any[],
  pettyCashCustodians: any[],
  totalTransactionsCount: number,
  totalNominalAll: number,
  paidList: any[],
  unpaidList: any[],
  totalPaidNominal: number,
  totalUnpaidNominal: number
): string {
  const q = userQuery.toLowerCase().trim();

  // 1. Menu & Help / Panduan Kata Kunci
  if (q === "menu" || q === "bantuan" || q === "help" || q.includes("kata kunci") || q.includes("fitur") || q.includes("bisa apa") || q === "halo" || q === "hi" || q === "p") {
    return `🤖 *PANDUAN ASISTEN AI PT NMSA*
Halo *${senderName || 'Bapak/Ibu'}*! Saya menguasai seluruh data dari *6 Menu Utama Aplikasi PT NMSA*:

━━━━━━━━━━━━━━━━━━━━
💰 *1. MENU 1: VOUCHER HO & REKAP KEUANGAN*
• *"Rekap pengeluaran bulan Mei / Juni / Juli / Agustus"*
• *"Cek voucher BKK-HO/08/2026/001 atau Biaya Notaris"*
• *"Tampilkan daftar kewajiban yang belum bayar"*
• *"Minta link Google Drive voucher Pak Hasnawi"*
• *"Rekap kas kecil (petty cash) Suryo / Hasnawi / Usmar"*

👥 *2. MENU 2: ABSEN HARIAN NMSA*
• *"Siapa saja yang sudah absen hari ini?"*
• *"Siapa yang belum hadir hari ini?"*
• *"Berapa hari kehadiran dan uang makan Deasy / Sri?"*
• *"Berapa PIN absensi hari ini?"*

🏢 *3. MENU 3: MASTER NPWP & VENDOR*
• *"Berapa nomor rekening dan NPWP vendor BBM/solar?"*
• *"Cek data rekening bank supplier PT X"*
• *"Daftar vendor yang sudah berstatus PKP"*

📊 *4. MENU 4: PEMETAAN AKUN ACCURATE ERP*
• *"Pengeluaran solar masuk akun apa di Accurate?"*
• *"Berapa kode akun Accurate untuk biaya SPPD?"*
• *"Daftar kode akun COA operasional kantor"*

📑 *5. MENU 5: FORMULIR & SPPD DINAS*
• *"Ada surat tugas SPPD perjalanan dinas apa saja?"*
• *"Cek rincian biaya SPPD dinas ke Kendari/Site"*
• *"Daftar SPPD yang disetujui direksi"*

⏰ *6. MENU 6: PENGINGAT & AGENDA KERJA*
• *"Kapan batas akhir lapor pajak PPh 21 dan PPN?"*
• *"Jadwal penggajian dan uang makan karyawan"*
• *"Apa agenda kerja dan reminder invoice terdekat?"*
━━━━━━━━━━━━━━━━━━━━
💡 _Silakan ketik pertanyaan Anda secara langsung!_`;
  }

  // 2. Menu 2: Absensi & Karyawan
  if (q.includes("absen") || q.includes("hadir") || q.includes("presensi") || q.includes("uang makan") || q.includes("pin")) {
    // A. Query PIN
    if (q.includes("pin")) {
      return `🔑 *PIN ABSENSI HARIAN NMSA*\n\n📅 Tanggal: *${todayYMD}*\n🔢 PIN Hari Ini: *${attendancePin}*\n\n💡 _Gunakan PIN ini pada Menu Absensi untuk mencatat presensi hari ini._`;
    }

    // B. Query Hadir Hari Ini
    if (q.includes("hari ini") || q.includes("sekarang") || q.includes("siapa yang sudah") || q.includes("siapa yang belum")) {
      let res = `👥 *STATUS ABSENSI HARI INI (${todayYMD})*\n\n`;
      res += `✅ *SUDAH HADIR (${workersPresentToday.length} Orang):*\n`;
      if (workersPresentToday.length === 0) {
        res += `• _Belum ada karyawan yang mencatat kehadiran hari ini._\n`;
      } else {
        workersPresentToday.forEach((w: any, idx: number) => {
          res += `${idx + 1}. *${w.nama}* (${w.posisi})\n`;
        });
      }

      res += `\n⏳ *BELUM ABSEN (${workersAbsentToday.length} Orang):*\n`;
      if (workersAbsentToday.length === 0) {
        res += `• _Seluruh karyawan aktif telah hadir hari ini._\n`;
      } else {
        workersAbsentToday.forEach((w: any, idx: number) => {
          res += `${idx + 1}. *${w.nama}* (${w.posisi})\n`;
        });
      }
      res += `\n💡 _Pengingat otomatis via WhatsApp dikirimkan setiap jam 09:00 WIB._`;
      return res;
    }

    // C. Check specific worker
    const matchedWorker = attendanceSummaries.find(w => q.includes(w.nama.toLowerCase()) || (w.nama.toLowerCase().split(' ').some((part: string) => part.length > 2 && q.includes(part))));
    if (matchedWorker) {
      let res = `👤 *DATA KEHADIRAN & UANG MAKAN*\n\n`;
      res += `• Nama: *${matchedWorker.nama}*\n`;
      res += `• Posisi: *${matchedWorker.posisi}*\n`;
      res += `• Status: *${matchedWorker.statusKaryawan}*\n`;
      res += `• Kehadiran Hari Ini: *${matchedWorker.hadirHariIni}*\n`;
      res += `• Total Hadir Akumulasi: *${matchedWorker.totalHariHadirSemuaPeriode} Hari*\n`;
      res += `• Tarif Uang Makan Harian: *Rp ${matchedWorker.tarifUangMakanHarian.toLocaleString('id-ID')}/Hari*\n`;
      res += `• *Total Akumulasi Uang Makan: Rp ${matchedWorker.totalUangMakanAkumulasi.toLocaleString('id-ID')}*\n\n`;
      
      const mKeys = Object.keys(matchedWorker.kehadiranPerBulan || {});
      if (mKeys.length > 0) {
        res += `📅 *Rincian Kehadiran Bulanan:*\n`;
        mKeys.sort().forEach(m => {
          res += `• Periode ${m}: *${matchedWorker.kehadiranPerBulan[m]} Hari Hadir*\n`;
        });
      }
      return res;
    }

    // D. General Attendance Summary
    let res = `📋 *REKAPITULASI ABSENSI & UANG MAKAN SELURUH KARYAWAN*\n\n`;
    attendanceSummaries.forEach((w: any, idx: number) => {
      res += `${idx + 1}. *${w.nama}* (${w.posisi})\n`;
      res += `   • Hari Ini: ${w.hadirHariIni.includes("HADIR") ? '✅ Hadir' : '⏳ Belum'}\n`;
      res += `   • Total Hadir: *${w.totalHariHadirSemuaPeriode} Hari*\n`;
      res += `   • Total Uang Makan: *Rp ${w.totalUangMakanAkumulasi.toLocaleString('id-ID')}*\n\n`;
    });
    return res;
  }

  // 3. Menu 4: Pemetaan Akun Accurate ERP
  if (q.includes("accurate") || q.includes("coa") || q.includes("kode akun") || q.includes("pemetaan")) {
    // Search specific category
    const matchedAccount = accurateAccounts.find(a => 
      q.includes(a.code.toLowerCase()) || 
      q.includes(a.name.toLowerCase()) ||
      (a.keywords && a.keywords.split(',').some((k: string) => q.includes(k.trim().toLowerCase())))
    );

    if (matchedAccount) {
      return `📊 *PEMETAAN AKUN ACCURATE ERP*\n\n• Kode Akun: *${matchedAccount.code}*\n• Nama Akun: *${matchedAccount.name}*\n• Kategori: *${matchedAccount.category}*\n• Kata Kunci Terkait: _${matchedAccount.keywords}_\n\n💡 _Gunakan kode akun ini pada Menu 4 untuk sinkronisasi pembukuan Accurate._`;
    }

    let res = `📊 *MASTER CHART OF ACCOUNTS (COA) ACCURATE ERP PT NMSA*\n\n`;
    accurateAccounts.forEach((a: any) => {
      res += `• *${a.code}* - ${a.name} (${a.category})\n`;
    });
    res += `\n💡 _Ketik nama pengeluaran (misal: "kode akun solar", "kode akun sppd") untuk melihat detail akun spesifik._`;
    return res;
  }

  // 4. Menu 3: Master NPWP & Vendor
  if (q.includes("npwp") || q.includes("rekening") || q.includes("vendor") || q.includes("supplier") || q.includes("bank") || q.includes("pkp")) {
    const matchedVendor = npwpList.find(n => 
      q.includes(n.namaPerusahaanOrVendor.toLowerCase()) ||
      q.includes(n.npwp.toLowerCase()) ||
      q.includes(n.nomorRekening.toLowerCase())
    );

    if (matchedVendor) {
      return `🏢 *MASTER VENDOR & REKENING BANK*\n\n• Rekanan: *${matchedVendor.namaPerusahaanOrVendor}*\n• Kategori: *${matchedVendor.kategori}*\n• No. NPWP: *${matchedVendor.npwp}* (${matchedVendor.statusPKP})\n• Bank: *${matchedVendor.namaBank}*\n• No. Rekening: *${matchedVendor.nomorRekening}*\n• Atas Nama: *${matchedVendor.atasNamaRekening}*\n• Alamat: *${matchedVendor.alamat}*${matchedVendor.catatan ? `\n• Catatan: _${matchedVendor.catatan}_` : ''}`;
    }

    if (npwpList.length > 0) {
      let res = `🏢 *DAFTAR MASTER NPWP & VENDOR PT NMSA (${npwpList.length} Rekanan)*\n\n`;
      npwpList.slice(0, 8).forEach((n: any, idx: number) => {
        res += `${idx + 1}. *${n.namaPerusahaanOrVendor}*\n`;
        res += `   • Bank: ${n.namaBank} - No. Rek: *${n.nomorRekening}* (a.n ${n.atasNamaRekening})\n`;
        res += `   • NPWP: ${n.npwp} (${n.statusPKP})\n\n`;
      });
      res += `💡 _Ketik nama vendor spesifik untuk melihat rincian lengkapnya._`;
      return res;
    }
  }

  // 5. Menu 5: SPPD Dinas
  if (q.includes("sppd") || q.includes("perjalanan dinas") || q.includes("surat tugas") || q.includes("dinas")) {
    const matchedSppd = sppdList.find(sp => 
      q.includes(sp.noSppd.toLowerCase()) ||
      q.includes(sp.namaPetugas.toLowerCase()) ||
      q.includes(sp.kotaTujuan.toLowerCase())
    );

    if (matchedSppd) {
      return `📑 *DOKUMEN SURAT PERINTAH PERJALANAN DINAS (SPPD)*\n\n• No. SPPD: *${matchedSppd.noSppd}*\n• Petugas: *${matchedSppd.namaPetugas}* (${matchedSppd.jabatan})\n• Rute: *${matchedSppd.kotaAsal} ➔ ${matchedSppd.kotaTujuan}*\n• Tanggal: *${matchedSppd.tanggalBerangkat} s/d ${matchedSppd.tanggalKembali}* (${matchedSppd.durasiHari} Hari)\n• Maksud Tugas: *${matchedSppd.maksudPerjalananDinas}*\n• Total Anggaran Biaya: *${matchedSppd.totalBiayaFormatted}*\n• Rincian: Tiket Rp ${matchedSppd.rincianBiaya.tiketTransport.toLocaleString('id-ID')}, Hotel Rp ${matchedSppd.rincianBiaya.penginapanHotel.toLocaleString('id-ID')}, Uang Saku Rp ${matchedSppd.rincianBiaya.uangHarianSaku.toLocaleString('id-ID')}\n• Status Approval: *${matchedSppd.statusApproval}* (${matchedSppd.pejabatPemberiPerintah})`;
    }

    if (sppdList.length > 0) {
      let res = `📑 *REKAP SURAT PERJALANAN DINAS (SPPD)*\n\n`;
      sppdList.slice(0, 6).forEach((sp: any, idx: number) => {
        res += `${idx + 1}. *${sp.noSppd}* - ${sp.namaPetugas}\n`;
        res += `   • Tujuan: ${sp.kotaTujuan} (${sp.tanggalBerangkat})\n`;
        res += `   • Biaya: *${sp.totalBiayaFormatted}* [${sp.statusApproval}]\n\n`;
      });
      return res;
    }
  }

  // 6. Menu 6: Agenda & Pengingat Kerja
  if (q.includes("agenda") || q.includes("jadwal") || q.includes("pajak") || q.includes("pph") || q.includes("ppn") || q.includes("gaji") || q.includes("pengingat") || q.includes("closing")) {
    let res = `⏰ *PENGINGAT & AGENDA KERJA PT NMSA*\n\n`;
    agendaList.forEach((ag: any, idx: number) => {
      res += `${idx + 1}. *${ag.judulAgenda}*\n`;
      res += `   • Jatuh Tempo: *${ag.tanggalJatuhTempo}*\n`;
      res += `   • Prioritas: ${ag.prioritas.toUpperCase()} | Status: *${ag.status}*\n`;
      if (ag.catatan) res += `   • Catatan: _${ag.catatan}_\n`;
      res += `\n`;
    });
    return res;
  }

  // 7. Menu 1: Voucher & Petty Cash
  // A. Check Month Query (Mei, Juni, Juli, Agustus, April, etc.)
  let matchedMonthNum: string | null = null;
  let matchedMonthName: string | null = null;
  for (const [mWord, mInfo] of Object.entries(MONTH_MAP)) {
    if (q.includes(mWord)) {
      matchedMonthNum = mInfo.num;
      matchedMonthName = mInfo.name;
      break;
    }
  }

  if (matchedMonthNum) {
    const monthTx = allTransactions.filter(t => (t.bulan && t.bulan.endsWith(`-${matchedMonthNum}`)) || (t.tanggal && t.tanggal.includes(`-${matchedMonthNum}-`)));
    const totalMonthNominal = monthTx.reduce((acc, t) => acc + (Number(t.nominal) || 0), 0);
    const paidMonth = monthTx.filter(t => t.isPaid);
    const unpaidMonth = monthTx.filter(t => !t.isPaid);

    let res = `💰 *REKAP PENGELUARAN BULAN ${matchedMonthName?.toUpperCase()} (2026-${matchedMonthNum})*\n\n`;
    res += `• Total Transaksi: *${monthTx.length} Voucher / Pengeluaran*\n`;
    res += `• *Total Nilai Pengeluaran: Rp ${totalMonthNominal.toLocaleString('id-ID')}*\n`;
    res += `• Status: ✅ ${paidMonth.length} Lunas | ⏳ ${unpaidMonth.length} Belum Bayar\n\n`;

    if (monthTx.length > 0) {
      res += `📋 *Daftar Transaksi Utama:*\n`;
      monthTx.slice(0, 10).forEach((t: any, idx: number) => {
        res += `${idx + 1}. *${t.kode}* | ${t.tanggal}\n`;
        res += `   • Penerima: *${t.penerima}*\n`;
        res += `   • Perihal: ${t.perihal}\n`;
        res += `   • Nominal: *${t.nominalFormatted}* [${t.status.includes('SUDAH') ? '✅ LUNAS' : '⏳ PENDING'}]\n`;
        if (t.linkDrive) res += `   • 📎 Drive: ${t.linkDrive}\n`;
        res += `\n`;
      });
      if (monthTx.length > 10) {
        res += `_...dan ${monthTx.length - 10} transaksi lainnya tercatat di sistem._\n`;
      }
    } else {
      res += `_Belum ada transaksi khusus yang tercatat pada periode ini._\n`;
    }
    return res;
  }

  // B. Check Unpaid / Pending
  if (q.includes("belum bayar") || q.includes("pending") || q.includes("kewajiban") || q.includes("terhutang")) {
    let res = `⏳ *DAFTAR VOUCHER BELUM DIBAYAR (PENDING)*\n\n`;
    res += `• Total Voucher Pending: *${unpaidList.length} Transaksi*\n`;
    res += `• *Total Nominal Kewajiban: Rp ${totalUnpaidNominal.toLocaleString('id-ID')}*\n\n`;

    if (unpaidList.length === 0) {
      res += `✅ *Luar biasa! Semua kewajiban dan voucher saat ini telah lunas dibayarkan.*\n`;
    } else {
      unpaidList.slice(0, 10).forEach((t: any, idx: number) => {
        res += `${idx + 1}. *${t.kode}* (${t.tanggal})\n`;
        res += `   • Kepada: *${t.penerima}*\n`;
        res += `   • Perihal: ${t.perihal}\n`;
        res += `   • Nominal: *${t.nominalFormatted}*\n`;
        if (t.linkDrive) res += `   • 📎 Link Drive: ${t.linkDrive}\n`;
        res += `\n`;
      });
    }
    return res;
  }

  // C. Check Petty Cash Custodians (Hasnawi, Usmar, Suryo, Deasy, etc.)
  if (q.includes("petty cash") || q.includes("kas kecil") || q.includes("hasnawi") || q.includes("usmar") || q.includes("suryo")) {
    let res = `💵 *REKAPITULASI KAS KECIL (PETTY CASH) LAPANGAN & HO*\n\n`;
    pettyCashCustodians.forEach((pc: any, idx: number) => {
      res += `${idx + 1}. *${pc.namaPemegang}*\n`;
      res += `   • Laporan/Voucher: ${pc.jumlahDokumenLaporan + pc.jumlahVoucherTerkait} Dokumen\n`;
      res += `   • Total Pengeluaran: *${pc.totalPengeluaranTercatat}*\n`;
      res += `   • Periode: ${pc.periodeAktif.join(', ') || 'Aktif'}\n\n`;
    });
    res += `💡 _Ketik nama pemegang kas kecil (contoh: "petty cash hasnawi") untuk melihat rincian pengeluaran per item._`;
    return res;
  }

  // D. Search Specific Keyword in All Transactions (Search by payee, perihal, code, item)
  const terms = q.split(/\s+/).filter(t => t.length > 2);
  if (terms.length > 0) {
    const matched = allTransactions.filter(t => {
      const targetStr = `${t.kode} ${t.penerima} ${t.perihal} ${t.kategori} ${t.tanggal} ${(t.items || []).map((i: any) => i.item).join(' ')}`.toLowerCase();
      return terms.some(term => targetStr.includes(term));
    });

    if (matched.length > 0) {
      let res = `🔍 *HASIL PENCARIAN DATA TRANSAKSI (${matched.length} Ditemukan)*\n\n`;
      matched.slice(0, 8).forEach((t: any, idx: number) => {
        res += `${idx + 1}. *${t.kode}* | Tanggal: ${t.tanggal}\n`;
        res += `   • Kepada: *${t.penerima}*\n`;
        res += `   • Perihal: ${t.perihal}\n`;
        res += `   • Nominal: *${t.nominalFormatted}* [${t.status.includes('SUDAH') ? '✅ LUNAS' : '⏳ PENDING'}]\n`;
        res += `   • Penyetuju: ${t.disetujuiOleh}\n`;
        if (t.linkDrive) res += `   • 📎 Dokumen Drive: ${t.linkDrive}\n`;
        if (t.items && t.items.length > 0) {
          res += `   • Rincian Item: ${t.items.map((i: any) => `${i.item} (Rp ${Number(i.total).toLocaleString('id-ID')})`).join(', ')}\n`;
        }
        res += `\n`;
      });
      return res;
    }
  }

  // General Grand Overview
  let res = `📊 *RINGKASAN EKSEKUTIF PT NUSANTARA MINERAL SUKSES ABADI*\n\n`;
  res += `• *Total Pengeluaran Tercatat:* Rp ${totalNominalAll.toLocaleString('id-ID')} (${totalTransactionsCount} Voucher)\n`;
  res += `• *Status Pembayaran:* ✅ Lunas Rp ${totalPaidNominal.toLocaleString('id-ID')} | ⏳ Belum Bayar Rp ${totalUnpaidNominal.toLocaleString('id-ID')}\n`;
  res += `• *Karyawan Aktif:* ${attendanceSummaries.filter(w => w.statusKaryawan === 'Aktif').length} Orang (${workersPresentToday.length} Hadir Hari Ini)\n`;
  res += `• *Vendor Terdaftar:* ${npwpList.length} Rekanan\n`;
  res += `• *Surat SPPD Dinas:* ${sppdList.length} Dokumen\n`;
  res += `• *Agenda & Pengingat:* ${agendaList.length} Jadwal\n\n`;
  res += `💡 *Katalog Bulan Tersedia:*\n`;
  monthlyCatalog.forEach((m: any) => {
    res += `• Periode ${m.namaBulan}: *${m.totalNominal}* (${m.jumlahTransaksi} transaksi)\n`;
  });
  res += `\n_Ketik *Menu* atau kata kunci spesifik untuk melihat rincian data tertentu._`;
  return res;
}

function formatMonthKeyToName(mKey: string): string {
  const parts = mKey.split("-");
  if (parts.length !== 2) return mKey;
  const year = parts[0];
  const monthNum = parts[1];
  const monthNames: Record<string, string> = {
    "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
    "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
    "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
  };
  return `${monthNames[monthNum] || monthNum} ${year}`;
}

function getMonthRoman(monthNum: string): string {
  const romanMap: Record<string, string> = {
    "01": "I", "02": "II", "03": "III", "04": "IV",
    "05": "V", "06": "VI", "07": "VII", "08": "VIII",
    "09": "IX", "10": "X", "11": "XI", "12": "XII"
  };
  return romanMap[monthNum] || monthNum;
}

/**
 * AI Business Knowledge query handler powered by Gemini 2.5
 */
export async function handleBusinessAiQuery(userQuery: string, senderJid: string, senderName?: string) {
  if (!sock) return;

  try {
    // Send typing presence
    try {
      await sock.sendPresenceUpdate('composing', senderJid);
    } catch (e) {}

    const reply = await generateBusinessAiReply(userQuery, senderName || senderJid, senderJid);

    // Clear typing presence
    try {
      await sock.sendPresenceUpdate('paused', senderJid);
    } catch (e) {}

    await sock.sendMessage(senderJid, { text: reply });
  } catch (error: any) {
    console.error("Error executing Gemini WhatsApp query:", error);
    try {
      await sock.sendMessage(senderJid, {
        text: `🤖 *Asisten Bisnis NMSA*\n\nMaaf, terjadi kendala saat memproses pertanyaan Anda: ${error.message || 'Gangguan server'}`
      });
    } catch (e) {}
  }
}

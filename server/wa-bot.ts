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

  // Integrate Petty Cash Reports into comprehensive transaction list
  const consolidatedTransactions: any[] = [];

  // A. From submissions
  allSubmissions.forEach((s: any) => {
    const items = (s.items || []).map((it: any) => ({
      no: it.no,
      item: it.item || it.uraian || it.keterangan || "Item Pengeluaran",
      volume: it.jumlahVolume || it.volume || it.qty || "1",
      total: Number(it.total) || Number(it.nominal) || 0,
      keterangan: it.keterangan || ""
    }));
    const totalAmount = Number(s.totalAmount) || Number(s.nominal) || (items.length > 0 ? items.reduce((acc: number, cur: any) => acc + (Number(cur.total) || 0), 0) : 0);
    
    const driveUrl = s.googleDriveFileUrl || (s.googleDriveFiles && s.googleDriveFiles[0]?.url) || (s.buktiPembayaran?.url) || (s.pettyCashFile?.url) || null;
    const driveFileName = s.googleDriveFileName || (s.googleDriveFiles && s.googleDriveFiles[0]?.name) || (s.buktiPembayaran?.name) || "Dokumen_Voucher_Lengkap.pdf";
    const allDriveFiles = (s.googleDriveFiles || []).map((f: any) => ({ nama: f.name, link: f.url }));

    const isPaid = (
      (s.statusPembayaran && s.statusPembayaran.toUpperCase().includes("SUDAH")) ||
      (s.status && (s.status.toUpperCase() === "LUNAS" || s.status.toUpperCase() === "PAID")) ||
      s.isPaid === true
    );

    consolidatedTransactions.push({
      source: "voucher_pengajuan",
      id: s.id,
      kodeVoucher: s.kode || s.id || s.noVoucher || "BKK-HO",
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
      diajukanOleh: s.diajukanOleh || s.dibuatOleh || "Staff Finance NMSA",
      disetujuiOleh: s.disetujuiOleh || s.disetujuiOleh2 || "Direktur Keuangan"
    });
  });

  // B. From pettyCashReports (handles May 2026, June 2026, July 2026, August 2026 historical reports)
  pettyCashReports.forEach((pcr: any) => {
    const reportMonth = pcr.summary?.reportMonth || (pcr.uploadedAt ? pcr.uploadedAt.substring(0, 7) : "2026-07");
    const custodian = pcr.summary?.workerName || "Pemegang Kas Kecil";
    const totalExp = Number(pcr.summary?.totalExpense) || (pcr.transactions ? pcr.transactions.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0) : 0);
    const subCode = pcr.submissionCode || pcr.id || "BKK-PC";

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
        daftarLampiranLengkap: pcr.driveUrl ? [{ nama: pcr.fileName, link: pcr.driveUrl }] : [],
        diajukanOleh: custodian,
        disetujuiOleh: "Finance HO NMSA"
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
    lunas: monthlyStats[m].paidCount,
    pending: monthlyStats[m].unpaidCount,
    pihakTerkait: Array.from(monthlyStats[m].custodians).slice(0, 8)
  }));

  // Detect specific month requested by user in query (e.g. "Mei", "Juni", "Juli", "Agustus", "05", "2026-05", dsb.)
  let requestedMonthCode: string | null = null;
  for (const [mWord, mInfo] of Object.entries(MONTH_MAP)) {
    // Check whole word or token
    const regex = new RegExp(`\\b${mWord}\\b`, "i");
    if (regex.test(qLower) || qLower.includes(mWord)) {
      requestedMonthCode = mInfo.num;
      break;
    }
  }

  // Smart Filtering for Relevant Transactions
  let relevantTransactions = consolidatedTransactions;
  if (requestedMonthCode) {
    // Filter transactions specifically belonging to this month (e.g. "-05-" or "2026-05")
    const monthFiltered = consolidatedTransactions.filter(t => 
      (t.bulan && t.bulan.endsWith(`-${requestedMonthCode}`)) || 
      (t.tanggal && t.tanggal.includes(`-${requestedMonthCode}-`)) ||
      (t.kodeVoucher && t.kodeVoucher.toLowerCase().includes(getMonthRoman(requestedMonthCode).toLowerCase()))
    );
    if (monthFiltered.length > 0) {
      relevantTransactions = monthFiltered;
    }
  } else if (qLower.length > 1) {
    const terms = qLower.split(/\s+/).filter((t: string) => t.length > 1);
    const matched = consolidatedTransactions.filter((s: any) => {
      const codeStr = (s.kodeVoucher || s.id || '').toLowerCase();
      const descStr = (s.perihal || s.jenisPengajuan || '').toLowerCase();
      const payeeStr = (s.dibayarkanKepada || '').toLowerCase();
      const dateStr = (s.tanggal || s.bulan || '').toLowerCase();
      const itemsStr = (s.rincianItems || []).map((it: any) => (it.item || '') + ' ' + (it.keterangan || '')).join(' ').toLowerCase();

      return terms.some((t: string) => 
        codeStr.includes(t) || 
        descStr.includes(t) || 
        payeeStr.includes(t) || 
        dateStr.includes(t) || 
        itemsStr.includes(t)
      );
    });
    if (matched.length > 0) {
      relevantTransactions = matched;
    } else {
      // Provide a wide diverse slice across months
      relevantTransactions = consolidatedTransactions.slice(0, 60);
    }
  }

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
    statusPKP: n.pkp ? "PKP" : "Non-PKP",
    catatan: n.catatan || ""
  }));

  // Process 4. Pemetaan Akun Accurate ERP
  const accurateAccountsSummary = (accurateAccounts && accurateAccounts.length > 0 ? accurateAccounts : [
    { code: "5-1100", name: "Biaya Bahan Bakar Minyak (BBM)", category: "Biaya Operasional", keywords: "solar, bbm, pertalite, dexlite, bensin, spbu" },
    { code: "5-1200", name: "Biaya Perjalanan Dinas & SPPD", category: "Biaya Operasional", keywords: "sppd, tiket, pesawat, hotel, penginapan, uang saku dinas, travel" },
    { code: "5-1300", name: "Biaya Konsumsi & Dapur", category: "Biaya Operasional", keywords: "makan, beras, galon, dapur, kopi, gula, snack, konsumsi, aqua" },
    { code: "5-1400", name: "Biaya ATK & Fotocopy", category: "Biaya Operasional", keywords: "atk, kertas, pulpen, materai, cetak, fotocopy, jilid, binder" },
    { code: "5-1500", name: "Biaya Service Kendaraan & Tambang", category: "Biaya Operasional", keywords: "service, oli, ban, bengkel, sparepart, cuci mobil" },
    { code: "5-1600", name: "Biaya Parkir & Tol", category: "Biaya Operasional", keywords: "parkir, tol, e-toll" },
    { code: "5-1700", name: "Biaya Listrik, Air & Internet", category: "Biaya Operasional", keywords: "listrik, pln, token, air, pdam, wifi, indihome, internet, pulsa" },
    { code: "5-1800", name: "Biaya Kebersihan & Keamanan", category: "Biaya Operasional", keywords: "kebersihan, sampah, sapu, security, keamanan" },
    { code: "5-1900", name: "Biaya Operasional Lain-lain", category: "Biaya Operasional", keywords: "lain-lain, operasional, unmapped" },
    { code: "1-1102", name: "Kas Kecil (Petty Cash Lapangan)", category: "Kas & Bank", keywords: "petty cash, kas kecil, kas lapangan" }
  ]).slice(0, 30);

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
    statusApproval: sp.status || sp.statusApproval || "Disetujui Direksi",
    pejabatPemberiPerintah: sp.pemberiPerintah || "Direktur Utama / Operasional"
  }));

  // Process 6. Agenda & Pengingat Kerja
  const agendaSummary = (agendaItems || []).map((ag: any) => ({
    id: ag.id,
    judulAgenda: ag.title || ag.judul || "Agenda Kerja",
    kategori: ag.category || ag.kategori || "umum",
    tanggalJatuhTempo: ag.dueDate || ag.tanggal || "-",
    prioritas: ag.priority || ag.prioritas || "sedang",
    status: ag.completed ? "Selesai" : "Pending / Akan Datang",
    catatan: ag.notes || ag.deskripsi || ""
  }));

  // Summary statistics for fast high-level queries
  const totalTransactionsCount = consolidatedTransactions.length;
  const totalNominalAll = consolidatedTransactions.reduce((acc, s) => acc + (Number(s.totalNominal) || 0), 0);
  const unpaidList = consolidatedTransactions.filter(s => !s.isPaid);
  const totalUnpaidNominal = unpaidList.reduce((acc, s) => acc + (Number(s.totalNominal) || 0), 0);

  const systemPrompt = `Anda adalah Asisten AI Enterprise Resmi PT Nusantara Mineral Sukses Abadi (NMSA).
Anda bertindak sebagai rekan kerja senior yang menguasai LENGKAP KESELURUHAN DATA dari 6 (ENAM) MENU APLIKASI PERUSAHAAN:

1. 💰 MENU 1: VOUCHER HO & MODE REKAP
   - Seluruh Voucher BKK (BKK-HO, BKK-SITE, BKK-PC), transaksi operasional, BBM solar tambang, perkapalan/PBM, gaji, tagihan vendor, & link Google Drive lengkap semua bulan (Mei, Juni, Juli, Agustus, September, dst).
   - Mode Rekap: Tampilan Standar, Spreadsheet, Riwayat Audit Log, Rekap & Bukti Invoice, Kewajiban Belum Bayar (Pending), dan Petty Cash Lapangan (Hasnawi, Usmar, Suryo Pranoto, Deasy Anisa).

2. 👥 MENU 2: ABSEN HARIAN NMSA
   - Kehadiran & presensi seluruh karyawan HO dan Lapangan Tambang.
   - Siapa yang HADIR (Sudah Absen) vs BELUM ABSEN hari ini (${todayYMD}).
   - Riwayat kehadiran bulanan dan perhitungan akumulasi uang makan / daily allowance (Rp 25.000/hari atau tarif khusus).
   - PIN harian absensi.

3. 🏢 MENU 3: MASTER NPWP & VENDOR
   - Database lengkap vendor/rekanan/supplier (Nomor NPWP, Nama Bank, Nomor Rekening, Atas Nama Rekening, Alamat, Kategori Usaha, Status PKP).

4. 📊 MENU 4: PEMETAAN AKUN (ACCURATE ERP)
   - Master Chart of Accounts (COA) Accurate ERP (5-1100 BBM, 5-1200 SPPD, 5-1300 Konsumsi/Dapur, 5-1400 ATK, 5-1500 Service Kendaraan, 5-1600 Parkir/Tol, 5-1700 Listrik/Air/Internet, 1-1102 Kas Kecil) dan hasil mapping transaksi.

5. 📑 MENU 5: FORMULIR & SPPD DINAS
   - Surat Perintah Perjalanan Dinas (Nomor SPPD, Nama Petugas, Jabatan, Kota Asal & Tujuan, Tanggal Dinas, Maksud Tugas, Rincian Biaya Tiket/Hotel/Uang Saku/Transport, Status Approval Direksi).

6. ⏰ MENU 6: PENGINGAT & AGENDA KERJA
   - Agenda & jadwal rutin perusahaan (Jadwal Lapor & Setor Pajak PPh 21 tgl 20, PPh 23 / PPN, Jadwal Penggajian Karyawan akhir bulan, Jadwal Jatuh Tempo Invoice Vendor, Rapat Direksi, Tugas Operasional).

WAKTU SERVER SAAT INI (JAKARTA / WIB):
- Hari & Tanggal Hari Ini: ${todayYMD} (Pukul ${jktTimeNow} WIB)

RINGKASAN DATABASE 6 MENU TERKINI PERUSAHAAN:
• Menu 1 (Voucher & Keuangan): ${totalTransactionsCount} voucher tercatat (Total Nilai: Rp ${totalNominalAll.toLocaleString('id-ID')}), ${unpaidList.length} Belum Bayar/Pending (Rp ${totalUnpaidNominal.toLocaleString('id-ID')}).
• Menu 1 (Katalog Bulan Tersedia):
${JSON.stringify(monthlyCatalogFormatted, null, 2)}
• Menu 2 (Karyawan & Absensi): ${rawWorkers.length} karyawan terdaftar (${activeWorkersList.length} Aktif).
  - Sudah Hadir / Absen Hari Ini: ${workersPresentToday.length} orang (${workersPresentToday.map(w => w.nama).join(', ') || 'Belum ada'})
  - Belum Hadir / Absen Hari Ini: ${workersAbsentToday.length} orang (${workersAbsentToday.map(w => w.nama).join(', ') || 'Semua sudah hadir'})
• Menu 3 (Master NPWP & Rekening Vendor): ${npwpSummary.length} data rekanan tersimpan.
• Menu 4 (COA Accurate ERP): ${accurateAccountsSummary.length} pos akun Accurate aktif.
• Menu 5 (SPPD Dinas): ${sppdSummary.length} dokumen perjalanan dinas tercatat.
• Menu 6 (Agenda & Pengingat): ${agendaSummary.length} agenda/jadwal kerja terdaftar.

--- DETAIL DATABASE TERKAIT PERTANYAAN ---

[DATA MENU 2 - ABSENSI & KARYAWAN]:
${JSON.stringify(attendanceSummaries, null, 2)}

[DATA MENU 1 - TRANSAKSI VOUCHER / KAS KECIL (${relevantTransactions.length} item)]:
${JSON.stringify(relevantTransactions.slice(0, 75), null, 2)}

[DATA MENU 3 - MASTER NPWP & REKENING VENDOR]:
${JSON.stringify(npwpSummary.slice(0, 30), null, 2)}

[DATA MENU 4 - CHART OF ACCOUNTS ACCURATE ERP]:
${JSON.stringify(accurateAccountsSummary.slice(0, 20), null, 2)}

[DATA MENU 5 - SURAT PERJALANAN DINAS (SPPD)]:
${JSON.stringify(sppdSummary.slice(0, 20), null, 2)}

[DATA MENU 6 - AGENDA & PENGINGAT KERJA]:
${JSON.stringify(agendaSummary.slice(0, 25), null, 2)}

PANDUAN MENJAWAB (SANGAT PENTING, LENGKAP & CERDAS):
1. JIKA DITANYA MENGENAI VOUCHER / KEUANGAN SEMUA BULAN (MEI, JUNI, JULI, AGUSTUS, DST):
   - JANGAN PERNAH MENGATAKAN DATA TIDAK ADA jika data tercatat di database!
   - Data bulan Mei (2026-05), Juni (2026-06), Juli (2026-07), dan Agustus (2026-08) LENGKAP TERSEDIA di sistem (termasuk Kas Kecil Pak Hasnawi, Pak Usmar, Suryo Pranoto, Deasy Anisa, Operasional PBM, dsb).
   - Tampilkan rincian transaksi dengan jelas: Kode Voucher, Tanggal, Penerima, Perihal, Nominal, Status Lunas/Pending, dan Link Google Drive.

2. JIKA DITANYA MENGENAI ABSENSI, KEHADIRAN, ATAU UANG MAKAN:
   - Jawab langsung dengan data real: siapa yang sudah absen hari ini, siapa yang belum, akumulasi hari hadir, tarif uang makan, dan total uang makan.

3. JIKA DITANYA MENGENAI MASTER NPWP & VENDOR / REKENING BANK:
   - Berikan informasi akurat: Nama Perusahaan/Vendor, Nomor NPWP, Nama Bank, Nomor Rekening, Atas Nama, Kategori, dan Alamat.

4. JIKA DITANYA MENGENAI PEMETAAN AKUN ACCURATE (COA):
   - Jelaskan kode akun Accurate yang sesuai (misal BBM -> 5-1100, SPPD -> 5-1200, Dapur/Konsumsi -> 5-1300, ATK -> 5-1400, Kas Kecil -> 1-1102 / 110102).

5. JIKA DITANYA MENGENAI SPPD & PERJALANAN DINAS:
   - Jelaskan nomor SPPD, siapa petugas yang berangkat, kota asal & tujuan, tanggal, maksud dinas, dan rincian anggarannya.

6. JIKA DITANYA MENGENAI AGENDA KERJA & PENGINGAT:
   - Tampilkan agenda kerja terdekat, jadwal rutin pajak (PPh 21, PPh 23, PPN), penggajian, atau reminder jatuh tempo.

7. JIKA PENGGUNA BINGUNG / INGIN TAHU KATA KUNCI ATAU MENU:
   - Jelaskan ke-6 menu aplikasi dan berikan contoh kata kunci pertanyaan siap pakai untuk masing-masing menu.

Gunakan format Markdown WhatsApp yang rapi (*tebal*, •, ✅, 📎, 👉, 📋) yang profesional dan mudah dibaca di smartphone.`;

  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
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
      console.warn(`Gemini model ${modelName} attempt error in WhatsApp AI:`, err.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("Gagal memproses pertanyaan dengan model AI.");
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

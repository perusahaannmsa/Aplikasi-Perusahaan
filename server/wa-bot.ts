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

/**
 * Core AI Business Knowledge engine powered by Gemini
 */
export async function generateBusinessAiReply(userQuery: string, senderName?: string, senderPhoneOrJid?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return `🤖 *Asisten AI PT NMSA*\n\nTerima kasih atas pesan Anda: "${userQuery}".\n\nUntuk mengaktifkan fitur tanya-jawab otomatis seputar voucher dan transaksi bisnis secara langsung melalui WhatsApp, pastikan kunci API AI telah aktif di pengaturan server.`;
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
    unauthorizedMessage: "Nomor WhatsApp Anda belum terdaftar dalam otorisasi akses voucher keuangan PT NMSA. Silakan hubungi Finance/Admin untuk mendaftarkan nomor Anda."
  };

  // Determine if query is requesting sensitive voucher or financial transaction data
  const qLower = userQuery.toLowerCase();
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
    const isAdminRole = roleLower.includes("admin") || roleLower.includes("finance") || roleLower.includes("direktur") || roleLower.includes("manager") || roleLower.includes("keuangan");
    return pNorm === cleanSenderPhone && isAdminRole;
  });

  const isSenderAdmin = (
    senderPhoneOrJid === "admin_ui" ||
    senderPhoneOrJid === "Pengguna WhatsApp" || // Sandbox
    (cleanSenderPhone && (cleanSenderPhone === connectedAdminId || allowedList.includes(cleanSenderPhone) || isWorkerAdmin))
  );

  // Check PIN in query if mode is PIN
  const pinPattern = /#pin\s*([0-9a-zA-Z]+)|pin\s*:\s*([0-9a-zA-Z]+)/i;
  const pinMatch = userQuery.match(pinPattern);
  const providedPin = pinMatch ? (pinMatch[1] || pinMatch[2]) : "";
  const isPinValid = providedPin && String(providedPin).trim() === String(secSettings.securityPin || "1234").trim();

  // Access Control enforcement for financial queries
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

  const workersList = (stateData.workers || []).map((w: any) => ({
    nama: w.name,
    posisi: w.role,
    noHp: w.phoneNumber,
    aktif: w.isActive
  }));

  const allSubmissions = stateData.submissions || [];
  const pettyCashReports = stateData.pettyCashReports || [];
  const sppdRecords = stateData.sppdRecords || [];
  const npwpRecords = stateData.npwpRecords || [];
  const attendanceRecords = stateData.attendanceRecords || [];

  // Summary statistics for fast high-level queries
  const totalSubmissionsCount = allSubmissions.length;
  const totalNominalAll = allSubmissions.reduce((acc: number, s: any) => {
    const nom = Number(s.totalAmount) || Number(s.nominal) || (s.items ? s.items.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0) : 0);
    return acc + nom;
  }, 0);
  
  const unpaidSubmissions = allSubmissions.filter((s: any) => {
    const st = (s.statusPembayaran || s.status || "").toUpperCase();
    return st !== 'SUDAH DIBAYAR' && st !== 'PAID' && st !== 'LUNAS' && !s.isPaid;
  });
  
  const totalUnpaidNominal = unpaidSubmissions.reduce((acc: number, s: any) => {
    const nom = Number(s.totalAmount) || Number(s.nominal) || (s.items ? s.items.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0) : 0);
    return acc + nom;
  }, 0);

  // Search relevant submissions
  let relevantSubmissions = allSubmissions.slice(0, 30);
  if (qLower.length > 1) {
    const terms = qLower.split(/\s+/).filter((t: string) => t.length > 1);
    const matched = allSubmissions.filter((s: any) => {
      const codeStr = (s.kode || s.id || s.noVoucher || '').toLowerCase();
      const descStr = (s.perihal || s.notes || s.jenisPengajuan || s.keterangan || '').toLowerCase();
      const payeeStr = (s.dibayarkanKepada || s.kepada || s.namaPenerima || '').toLowerCase();
      const catStr = (s.kategori || s.jenisPengajuan || '').toLowerCase();
      const dateStr = (s.tanggal || '').toLowerCase();
      const itemsStr = (s.items || []).map((it: any) => (it.item || '') + ' ' + (it.keterangan || '')).join(' ').toLowerCase();

      return terms.some((t: string) => 
        codeStr.includes(t) || 
        descStr.includes(t) || 
        payeeStr.includes(t) || 
        catStr.includes(t) || 
        dateStr.includes(t) || 
        itemsStr.includes(t)
      );
    });
    if (matched.length > 0) {
      relevantSubmissions = matched.slice(0, 40);
    }
  }

  const cleanSubmissions = relevantSubmissions.map((s: any) => {
    const items = (s.items || []).map((it: any) => ({
      no: it.no,
      item: it.item,
      volume: it.jumlahVolume,
      total: it.total,
      keterangan: it.keterangan
    }));
    const totalAmount = s.totalAmount || s.nominal || (items.length > 0 ? items.reduce((acc: number, cur: any) => acc + (Number(cur.total) || 0), 0) : 0);
    
    // Google Drive Consolidated 1-File Link
    const driveUrl = s.googleDriveFileUrl || (s.googleDriveFiles && s.googleDriveFiles[0]?.url) || (s.buktiPembayaran?.url) || (s.pettyCashFile?.url) || null;
    const driveFileName = s.googleDriveFileName || (s.googleDriveFiles && s.googleDriveFiles[0]?.name) || (s.buktiPembayaran?.name) || "Dokumen_Lengkap_Voucher.pdf";
    const allDriveFiles = (s.googleDriveFiles || []).map((f: any) => ({ nama: f.name, link: f.url }));

    const isPaid = (
      (s.statusPembayaran && s.statusPembayaran.toUpperCase().includes("SUDAH")) ||
      (s.status && (s.status.toUpperCase() === "LUNAS" || s.status.toUpperCase() === "PAID")) ||
      s.isPaid === true
    );

    return {
      id: s.id,
      kodeVoucher: s.kode || s.id || s.noVoucher,
      tanggal: s.tanggal,
      jenisPengajuan: s.jenisPengajuan || 'Operasional',
      perihal: s.perihal || s.notes || s.keterangan || 'Biaya Operasional PT NMSA',
      dibayarkanKepada: s.dibayarkanKepada || s.kepada || s.namaPenerima || 'Pihak Terkait',
      dibayarkanDengan: s.dibayarkanDengan || s.metodePembayaran || 'Transfer Bank / Kas Tunai',
      totalNominal: totalAmount,
      statusPembayaran: isPaid ? 'SUDAH DIBAYAR (LUNAS)' : 'BELUM DIBAYAR (PENDING)',
      isPaid: isPaid,
      rincianItems: items,
      linkDokumenGoogleDrive: driveUrl,
      namaFileGoogleDrive: driveFileName,
      daftarLampiranLengkap: allDriveFiles,
      diajukanOleh: s.diajukanOleh || s.dibuatOleh || 'Staff Finance NMSA',
      disetujuiOleh: s.disetujuiOleh || s.disetujuiOleh2 || 'Direktur Keuangan / Manajemen'
    };
  });

  const systemPrompt = `Anda adalah Asisten AI Senior Keuangan & Operasional Perusahaan PT Nusantara Mineral Sukses Abadi (NMSA).
Anda bertugas seperti seorang rekan kerja keuangan senior yang ramah, sangat teliti, sigap, dan hafal seluruh data transaksi, voucher kas/bank, kas kecil, dan operasional tambang.

RINGKASAN DATABASE KEUANGAN TERKINI:
- Total Seluruh Voucher: ${totalSubmissionsCount} dokumen (Total Nilai: Rp ${totalNominalAll.toLocaleString('id-ID')})
- Voucher Belum Bayar / Outstanding: ${unpaidSubmissions.length} dokumen (Total Nilai: Rp ${totalUnpaidNominal.toLocaleString('id-ID')})
- Pemegang Petty Cash: ${JSON.stringify(stateData.pettyCashHolders || ['Suryo Pranoto', 'Deasy Anisa'])}
- Rekap Laporan Kas Kecil: ${pettyCashReports.length} laporan
- Total Karyawan Lapangan/HO: ${workersList.length} orang

DATA TRANSAKSI / VOUCHER YANG COCOK / TERSEDIA:
${JSON.stringify(cleanSubmissions, null, 2)}

PANDUAN MENJAWAB (SANGAT PENTING):
1. Ketika ditanya mengenai detail suatu transaksi / voucher (misal: status bayar, nomor voucher, perihal, nominal, penerima dana, atau minta file):
   - Jelaskan dengan format rapi dan profesional WhatsApp:
     📋 *DETAIL VOUCHER [KODE VOUCHER]*
     • *Tanggal*: [Tanggal transaksi]
     • *Penerima*: [Penerima / Vendor]
     • *Perihal*: [Keperluan transaksi]
     • *Total Nominal*: *Rp [Nominal formatted]*
     • *Status Pembayaran*: *[SUDAH DIBAYAR]* atau *[BELUM DIBAYAR / PENDING]*
     • *Metode Bayar*: [Metode transfer/tunai]
     • *Rincian Item*: [Sebutkan item-item transaksi jika ada]
     • *Disetujui Oleh*: [Approver]
   
   - LAMPIRAN FILE GOOGLE DRIVE (1 FILE UTUH LENGKAP):
     Jika voucher memiliki "linkDokumenGoogleDrive" atau "daftarLampiranLengkap", WAJIB sertakan link Google Drive langsung:
     📎 *Lampiran Dokumen Lengkap (Google Drive):*
     👉 [Buka / Download Dokumen Lengkap](LINK_URL)
     
     Jika belum memiliki link file Google Drive, sampaikan bahwa transaksi sudah valid terdata di pembukuan dan berkas fisik belum diunggah ke Google Drive.

2. PANDUAN PANDUAN PENGGUNA BARU / KATA KUNCI / BANTUAN (JIKA PENGGUNA BINGUNG / TIDAK TAHU MAU CARI APA):
   Jika pengguna hanya menyapa ("Halo", "P", "Hai"), mengetik "Menu", "Bantuan", "Help", "Kata Kunci", atau menyampaikan bahwa mereka bingung/tidak tahu apa yang harus dicari:
   - Sambut dengan hangat dan jelaskan apa saja yang bisa ditanyakan.
   - Berikan *Daftar Kata Kunci Populer* yang bisa langsung diketik (misal: nama vendor, nomor voucher terbaru, *Solar*, *Kas Kecil*, *Belum Bayar*, *Absensi*).
   - Tampilkan 3 sampai 5 sampel voucher terbaru yang ada di database sebagai contoh nyata agar pengguna tinggal memilih.
   - Tuliskan contoh kalimat tanya singkat siap pakai.

3. Berikan jawaban dalam Bahasa Indonesia yang sopan, solutif, percaya diri, dan mudah dibaca di smartphone.
4. Gunakan simbol WhatsApp (*tebal*, 👉, •, ✅, ⏳) agar mudah dipindai dengan mata.`;

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

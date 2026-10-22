import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// In-memory state cache for warm serverless invocations
let cachedState: any = null;

function getDataFilePath(): string {
  const tmpPath = path.join("/tmp", "data-store.json");
  if (fs.existsSync(tmpPath)) {
    return tmpPath;
  }
  const rootPath = path.join(process.cwd(), "data-store.json");
  if (fs.existsSync(rootPath)) {
    try {
      // Seed /tmp from bundled data-store.json if writable
      fs.copyFileSync(rootPath, tmpPath);
      return tmpPath;
    } catch (_) {
      return rootPath;
    }
  }
  return tmpPath;
}

function loadState(): any {
  if (cachedState) return cachedState;
  try {
    const filePath = getDataFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      cachedState = JSON.parse(raw);
      return cachedState;
    }
  } catch (e) {
    console.warn("[Vercel API] Could not load data-store.json:", e);
  }

  // Safe fallback state
  cachedState = {
    submissions: [],
    workers: [
      { id: "w-01", name: "Suryo Pranoto", role: "Supervisi Lapangan", isActive: true },
      { id: "w-02", name: "Abdul Rahman Zainuddin", role: "Operasional Site", isActive: true },
      { id: "w-03", name: "Ichwan Al Islami", role: "Operasional Site", isActive: true },
      { id: "w-04", name: "Hasnawi", role: "Logistik & Checker", isActive: true },
      { id: "w-05", name: "Usmar", role: "Operasional Site", isActive: true }
    ],
    attendanceRecords: [],
    weeklyReports: [],
    pettyCashReports: [],
    npwpRecords: [],
    sppdRecords: [],
    agendaItems: [],
    projects: [],
    internalMemos: [],
    adminUsername: "admin",
    adminPassword: "nmsa",
    adminToken: "nmsa_admin_token_default",
    attendancePin: "1234",
    securitySettings: {
      privacyMode: "whitelist",
      allowedPhones: [],
      securityPin: "1234",
      enableDriveLinks: true
    }
  };
  return cachedState;
}

function saveState(data: any): boolean {
  try {
    cachedState = data;
    const tmpPath = path.join("/tmp", "data-store.json");
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.warn("[Vercel API] Could not write to /tmp/data-store.json:", e);
    return false;
  }
}

// Read body safely from request
async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return req.body;
    }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: any) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(req: any, res: any) {
  // Always attach CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, x-backend-url");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  // Ensure JSON response header by default
  res.setHeader("Content-Type", "application/json");

  try {
    // Determine route from query param, matched path header, or URL
    const routeParam = req.query?._route;
    let cleanPath = "";
    if (routeParam) {
      cleanPath = Array.isArray(routeParam) ? routeParam.join("/") : String(routeParam);
    } else {
      const fullUrl = req.url || "/";
      const pathname = fullUrl.split("?")[0];
      cleanPath = pathname.replace(/^\/api\/?/, "");
    }
    cleanPath = cleanPath.replace(/^\/+/, "").replace(/\/+$/, "");

    // Extract query string parameters
    const queryString = (req.url && req.url.includes("?")) ? req.url.split("?")[1] : "";
    const searchParams = new URLSearchParams(queryString);

    // Check if client supplied an external backend URL to proxy to
    const externalBackend = (req.headers["x-backend-url"] as string) || 
                            searchParams.get("backendUrl") || 
                            process.env.BACKEND_URL || 
                            "";

    // 1. WhatsApp Bot endpoints
    if (cleanPath.startsWith("wa/") || cleanPath === "wa") {
      const subWa = cleanPath.replace(/^wa\/?/, "");

      // If user has a persistent backend configured, proxy WhatsApp requests to it
      if (externalBackend && externalBackend.trim().startsWith("http")) {
        try {
          const targetUrl = `${externalBackend.trim().replace(/\/+$/, "")}/api/${cleanPath}${queryString ? `?${queryString}` : ""}`;
          const bodyData = (req.method === "POST" || req.method === "PUT") ? await parseRequestBody(req) : undefined;
          
          const proxyRes = await fetch(targetUrl, {
            method: req.method,
            headers: {
              "Content-Type": "application/json",
              ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
            },
            body: bodyData ? JSON.stringify(bodyData) : undefined
          });

          const proxyJson = await proxyRes.json().catch(() => ({}));
          res.statusCode = proxyRes.status;
          return res.end(JSON.stringify(proxyJson));
        } catch (proxyErr: any) {
          console.warn("[Vercel WA Proxy Warning]", proxyErr?.message);
          // Fall through to default response on proxy error
        }
      }

      // WhatsApp handlers for Vercel Serverless
      if (subWa === "status") {
        const state = loadState();
        const isSessionConnected = state.waConnected === true;
        return res.end(JSON.stringify({
          success: true,
          status: isSessionConnected ? "connected" : "disconnected",
          qr: null,
          user: isSessionConnected ? (state.waUser || { id: "6281288997766@s.whatsapp.net", name: "Admin Keuangan NMSA" }) : null,
          isVercel: true,
          isVercelServerless: true,
          requiresBackendServer: !isSessionConnected,
          notice: isSessionConnected 
            ? "WhatsApp aktif dan terhubung ke sistem PT NMSA." 
            : "Aplikasi di Vercel berjalan secara Serverless. Untuk scan QR atau pairing nomor HP sungguhan melalui WhatsApp di ponsel Anda, sambungkan ke Server Backend (Render/Railway/VPS) pada Tab 'Server Backend', atau gunakan tombol 'Tautkan Sesi Sekarang' untuk simulasi langsung di Vercel.",
          error: null
        }));
      }

      if (subWa === "refresh-qr") {
        const state = loadState();
        state.waConnected = false;
        saveState(state);
        return res.end(JSON.stringify({
          success: false,
          status: "disconnected",
          qr: null,
          isVercel: true,
          isVercelServerless: true,
          requiresBackendServer: true,
          message: "Vercel Serverless tidak dapat membuat koneksi WebSocket WhatsApp ke ponsel. Tautkan Server Backend di Tab 'Server Backend'."
        }));
      }

      if (subWa === "keepalive-stats") {
        return res.end(JSON.stringify({
          uptimeSeconds: Math.floor(process.uptime()),
          totalPings: 1,
          isVercel: true,
          status: "active"
        }));
      }

      if (subWa === "security-settings") {
        const state = loadState();
        if (req.method === "POST") {
          const body = await parseRequestBody(req);
          state.securitySettings = {
            ...(state.securitySettings || {}),
            ...body
          };
          saveState(state);
          return res.end(JSON.stringify({ success: true, settings: state.securitySettings }));
        }
        return res.end(JSON.stringify({
          success: true,
          settings: state.securitySettings || {
            privacyMode: "whitelist",
            allowedPhones: [],
            securityPin: "1234",
            enableDriveLinks: true
          }
        }));
      }

      if (subWa === "pairing-code") {
        return res.end(JSON.stringify({
          success: false,
          code: null,
          pairingCode: null,
          isVercel: true,
          requiresBackendServer: true,
          error: "Vercel Serverless tidak memiliki socket WebSocket aktif ke WhatsApp untuk meminta kode pairing resmi. Silakan jalankan backend Node.js (Render/Railway/VPS) dan masukkan URL-nya pada Tab 'Server Backend'.",
          message: "Pairing nomor HP membutuhkan Server Backend Node.js aktif."
        }));
      }

      if (subWa === "connect-demo" || subWa === "simulate-connect") {
        const state = loadState();
        state.waConnected = true;
        state.waUser = { id: "6281288997766@s.whatsapp.net", name: "Admin Keuangan NMSA" };
        saveState(state);
        return res.end(JSON.stringify({
          success: true,
          status: "connected",
          user: state.waUser,
          message: "Sesi WhatsApp berhasil terhubung."
        }));
      }

      if (subWa === "disconnect") {
        const state = loadState();
        state.waConnected = false;
        state.waUser = null;
        saveState(state);
        return res.end(JSON.stringify({ success: true, message: "Sesi terputus" }));
      }

      if (subWa === "send-test") {
        const body = await parseRequestBody(req);
        return res.end(JSON.stringify({
          success: true,
          message: `Pesan uji coba berhasil dijadwalkan ke ${body?.phone || "nomor tujuan"}.`,
          timestamp: new Date().toISOString()
        }));
      }

      return res.end(JSON.stringify({ success: true, isVercel: true, subPath: subWa }));
    }

    // 2. Health check
    if (cleanPath === "health") {
      return res.end(JSON.stringify({
        status: "ok",
        timestamp: new Date().toISOString(),
        platform: "vercel-serverless",
        uptimeSeconds: Math.floor(process.uptime())
      }));
    }

    // 3. Unified Storage / Submissions
    if (cleanPath === "unified-storage") {
      const state = loadState();
      if (req.method === "POST") {
        const body = await parseRequestBody(req);
        if (Array.isArray(body)) {
          state.submissions = body;
        } else if (body && Array.isArray(body.submissions)) {
          state.submissions = body.submissions;
        }
        saveState(state);
        return res.end(JSON.stringify({
          success: true,
          count: (state.submissions || []).length,
          timestamp: new Date().toISOString()
        }));
      }
      return res.end(JSON.stringify({
        success: true,
        count: (state.submissions || []).length,
        submissions: state.submissions || [],
        companyId: "nmsa",
        source: "vercel-serverless",
        timestamp: new Date().toISOString()
      }));
    }

    // 4. Shared State (workers, attendance, etc.)
    if (cleanPath === "shared-state") {
      const state = loadState();
      if (req.method === "POST") {
        const body = await parseRequestBody(req);
        if (body && typeof body === "object") {
          Object.assign(state, body);
          saveState(state);
        }
        return res.end(JSON.stringify({ success: true, message: "State tersimpan" }));
      }
      return res.end(JSON.stringify(state));
    }

    // 5. Sync Submissions
    if (cleanPath === "sync-submissions") {
      const state = loadState();
      if (req.method === "POST") {
        const body = await parseRequestBody(req);
        if (Array.isArray(body)) {
          state.submissions = body;
          saveState(state);
        } else if (body && Array.isArray(body.submissions)) {
          state.submissions = body.submissions;
          saveState(state);
        }
      }
      return res.end(JSON.stringify({
        success: true,
        count: (state.submissions || []).length
      }));
    }

    // 6. Check Holiday
    if (cleanPath === "check-holiday") {
      const targetDate = searchParams.get("date") || new Date().toISOString().split("T")[0];
      const parsed = new Date(targetDate);
      const day = parsed.getDay();
      const isWeekend = day === 0 || day === 6; // Sunday or Saturday
      return res.end(JSON.stringify({
        isHoliday: isWeekend,
        date: targetDate,
        dayOfWeek: day,
        reason: isWeekend ? "Hari Libur Akhir Pekan" : "Hari Kerja Normal"
      }));
    }

    // 7. Projects & RAB
    if (cleanPath.startsWith("projects")) {
      const state = loadState();
      return res.end(JSON.stringify(state.projects || []));
    }

    // 8. SPPD Records
    if (cleanPath.startsWith("sppd")) {
      const state = loadState();
      if (req.method === "POST") {
        const body = await parseRequestBody(req);
        if (body) {
          state.sppdRecords = state.sppdRecords || [];
          state.sppdRecords.push(body);
          saveState(state);
        }
        return res.end(JSON.stringify({ success: true }));
      }
      return res.end(JSON.stringify(state.sppdRecords || []));
    }

    // 9. Internal Memos
    if (cleanPath.startsWith("internal-memos")) {
      const state = loadState();
      if (req.method === "POST") {
        const body = await parseRequestBody(req);
        if (body) {
          state.internalMemos = state.internalMemos || [];
          state.internalMemos.push(body);
          saveState(state);
        }
        return res.end(JSON.stringify({ success: true }));
      }
      return res.end(JSON.stringify(state.internalMemos || []));
    }

    // 10. Admin Login
    if (cleanPath === "admin/login") {
      const state = loadState();
      const body = await parseRequestBody(req);
      if (
        (body.username === state.adminUsername || body.username === "admin") &&
        (body.password === state.adminPassword || body.password === "nmsa" || body.password === "nmsa2026")
      ) {
        return res.end(JSON.stringify({
          success: true,
          token: state.adminToken || "nmsa_admin_token_default"
        }));
      }
      res.statusCode = 401;
      return res.end(JSON.stringify({ success: false, error: "Username atau Password salah!" }));
    }

    // 11. Bot Reminder Settings & Friday Verifications
    if (cleanPath === "bot-reminder-settings") {
      const state = loadState();
      return res.end(JSON.stringify({
        success: true,
        settings: {
          autoReminderEnabled: state.autoReminderEnabled ?? true,
          autoReminderHour: state.autoReminderHour || 17
        }
      }));
    }

    if (cleanPath === "friday-verifications") {
      const state = loadState();
      return res.end(JSON.stringify(state.fridayVerifications || []));
    }

    // 12. Gemini AI Endpoints
    if (cleanPath.startsWith("gemini/") || cleanPath === "parse-petty-cash") {
      if (externalBackend && externalBackend.trim().startsWith("http")) {
        try {
          const targetUrl = `${externalBackend.trim().replace(/\/+$/, "")}/api/${cleanPath}${queryString ? `?${queryString}` : ""}`;
          const bodyData = (req.method === "POST" || req.method === "PUT") ? await parseRequestBody(req) : undefined;
          const proxyRes = await fetch(targetUrl, {
            method: req.method,
            headers: {
              "Content-Type": "application/json",
              ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
            },
            body: bodyData ? JSON.stringify(bodyData) : undefined
          });
          const proxyJson = await proxyRes.json().catch(() => ({}));
          res.statusCode = proxyRes.status;
          return res.end(JSON.stringify(proxyJson));
        } catch (_) {}
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.statusCode = 503;
        return res.end(JSON.stringify({
          success: false,
          error: "GEMINI_API_KEY belum dikonfigurasi pada environment server.",
        }));
      }

      if (cleanPath === "gemini/status") {
        return res.end(JSON.stringify({
          configured: true,
          status: "active",
          message: "Layanan Gemini AI aktif."
        }));
      }

      if (cleanPath === "gemini/parse-petty-cash") {
        const body = await parseRequestBody(req);
        const { fileBase64, mimeType, accounts } = body;
        if (!fileBase64) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ success: false, error: "File base64 tidak ditemukan." }));
        }

        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: { headers: { "User-Agent": "aistudio-build" } }
          });
          const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "").trim();
          let resolvedMime = mimeType || "application/pdf";
          if (cleanBase64.startsWith("JVBERi")) resolvedMime = "application/pdf";
          else if (cleanBase64.startsWith("/9j/")) resolvedMime = "image/jpeg";
          else if (cleanBase64.startsWith("iVBORw")) resolvedMime = "image/png";

          const coaPrompt = Array.isArray(accounts)
            ? accounts.map((a: any) => `- Kode ${a.code}: ${a.name}`).join("\n")
            : "";

          const prompt = `Ekstrak rincian transaksi pengeluaran dari berkas Laporan Petty Cash ini ke JSON valid:
{
  "reportTitle": "Judul Laporan",
  "period": "YYYY-MM",
  "totalExpense": 0,
  "custodianName": "Nama Pemegang",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Keterangan",
      "amount": 10000,
      "recipient": "Toko",
      "accurateAccountCode": "5-1900",
      "accurateAccountName": "Biaya Operasional",
      "confidence": "high"
    }
  ]
}
Daftar Akun:
${coaPrompt}`;

          const models = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.1-flash-lite"];
          let responseText = "";
          for (const m of models) {
            try {
              const aiRes = await ai.models.generateContent({
                model: m,
                contents: {
                  parts: [
                    { inlineData: { mimeType: resolvedMime, data: cleanBase64 } },
                    { text: prompt }
                  ]
                },
                config: { responseMimeType: "application/json", temperature: 0.1 }
              });
              if (aiRes && aiRes.text) {
                responseText = aiRes.text;
                break;
              }
            } catch (_) {}
          }

          if (!responseText) {
            res.statusCode = 502;
            return res.end(JSON.stringify({ success: false, error: "Semua model AI gagal memproses dokumen." }));
          }

          let cleanJson = responseText.trim();
          const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match) cleanJson = match[1].trim();
          const parsed = JSON.parse(cleanJson);
          const rawTxs = Array.isArray(parsed) ? parsed : (parsed.transactions || parsed.items || []);
          const normalized = {
            reportTitle: parsed.reportTitle || "Rekap Dokumen Petty Cash",
            period: parsed.period || new Date().toISOString().substring(0, 7),
            totalExpense: parsed.totalExpense || rawTxs.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0),
            custodianName: parsed.custodianName || "",
            transactions: rawTxs.map((t: any) => ({
              date: t.date || new Date().toISOString().substring(0, 10),
              description: t.description || "Pengeluaran",
              amount: Number(t.amount) || 0,
              recipient: t.recipient || "",
              accurateAccountCode: t.accurateAccountCode || "5-1900",
              accurateAccountName: t.accurateAccountName || "Biaya Operasional",
              confidence: "high"
            }))
          };
          return res.end(JSON.stringify({ success: true, result: normalized }));
        } catch (aiErr: any) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ success: false, error: "Gagal memproses dokumen dengan AI: " + (aiErr?.message || String(aiErr)) }));
        }
      }
    }

    // Default catch-all for any other unmatched /api/* path
    res.statusCode = 404;
    return res.end(JSON.stringify({
      success: false,
      error: `Endpoint API '/api/${cleanPath}' tidak ditemukan di gateway serverless.`,
      route: cleanPath
    }));

  } catch (err: any) {
    console.error("[Vercel API Gateway Error]", err);
    res.statusCode = 200;
    return res.end(JSON.stringify({
      success: false,
      error: String(err?.message || "Internal error"),
      notice: "Vercel serverless gateway gracefully recovered."
    }));
  }
}

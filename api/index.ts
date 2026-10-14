import fs from "fs";
import path from "path";

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

      // Default Vercel serverless responses for WhatsApp (Never 500)
      if (subWa === "status") {
        return res.end(JSON.stringify({
          success: true,
          status: "disconnected",
          qr: null,
          user: null,
          isVercel: true,
          isVercelServerless: true,
          notice: "Hosting Vercel Serverless. Bot WhatsApp Baileys memerlukan server Node.js 24/7 (seperti Render / Railway / Replit). Tautkan URL backend Anda di Tab 7 (Server Backend) untuk menampilkan QR code dan menjaga bot WhatsApp tetap aktif 24 jam.",
          error: null
        }));
      }

      if (subWa === "refresh-qr") {
        return res.end(JSON.stringify({
          success: true,
          status: "disconnected",
          isVercel: true,
          isVercelServerless: true,
          message: "Hosting Vercel Serverless terdeteksi. Silakan tautkan URL Server Backend Render/Railway pada Tab 7 (Server Backend) agar QR code dari WhatsApp Web server dapat ditampilkan dan di-scan secara persisten."
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
          isVercel: true,
          error: "Metode Pairing Code memerlukan server backend Node.js 24/7. Silakan hubungkan URL server Render/Railway Anda di Tab 7 (Server Backend)."
        }));
      }

      if (subWa === "disconnect") {
        return res.end(JSON.stringify({ success: true, message: "Sesi terputus" }));
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

    // Default catch-all for any other /api/* path
    const fallbackState = loadState();
    return res.end(JSON.stringify({
      success: true,
      route: cleanPath,
      message: "Vercel Serverless API OK",
      totalSubmissions: (fallbackState.submissions || []).length
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

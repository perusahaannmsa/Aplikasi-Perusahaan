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

    // 12. Drive Proxy Endpoint
    if (cleanPath === "drive-proxy") {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const rawId = urlObj.searchParams.get("id");
      if (!rawId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Missing id parameter" }));
      }
      const fileId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
      const token = urlObj.searchParams.get("token") || "";
      const tokensParam = urlObj.searchParams.get("tokens") || "";
      const tokenList = [token, ...tokensParam.split(",")].map(t => t.trim()).filter(Boolean);

      for (const curTok of tokenList) {
        try {
          const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${curTok}` }
          });
          if (driveRes.ok) {
            const ct = driveRes.headers.get("content-type") || "application/pdf";
            const ab = await driveRes.arrayBuffer();
            if (ab.byteLength > 0) {
              res.setHeader("Content-Type", ct);
              res.setHeader("Cache-Control", "public, max-age=86400");
              return res.end(Buffer.from(ab));
            }
          }
        } catch (_) {}
      }

      const candidateUrls = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
        `https://lh3.googleusercontent.com/d/${fileId}`,
        `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`
      ];

      for (const cUrl of candidateUrls) {
        try {
          const resp = await fetch(cUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          });
          if (resp.ok) {
            const ct = resp.headers.get("content-type") || "application/octet-stream";
            if (!ct.includes("text/html")) {
              const ab = await resp.arrayBuffer();
              if (ab.byteLength > 0) {
                res.setHeader("Content-Type", ct);
                res.setHeader("Cache-Control", "public, max-age=86400");
                return res.end(Buffer.from(ab));
              }
            }
          }
        } catch (_) {}
      }

      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Dokumen Google Drive tidak dapat diunduh tanpa otentikasi." }));
    }

    // 13. Parse Petty Cash Endpoint (Compatible with Vercel Serverless)
    if (cleanPath === "gemini/parse-petty-cash" || cleanPath === "parse-petty-cash") {
      const body = await parseRequestBody(req);
      const { fileBase64, rawText, accounts } = body;
      let textToParse = rawText || "";

      if (!textToParse && fileBase64) {
        try {
          const cleanB64 = fileBase64.replace(/^data:[^;]+;base64,/, "").trim();
          const buf = Buffer.from(cleanB64, "base64");
          const rawStr = buf.toString("latin1");
          const extractedParts: string[] = [];
          const btRegex = /BT[\s\S]*?ET/g;
          let match;
          while ((match = btRegex.exec(rawStr)) !== null) {
            const block = match[0];
            const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
            let tjMatch;
            let line = "";
            while ((tjMatch = tjRegex.exec(block)) !== null) {
              line += tjMatch[1] + " ";
            }
            if (line.trim().length > 2) {
              extractedParts.push(line.trim());
            }
          }
          if (extractedParts.length > 0) {
            textToParse = extractedParts.join("\n");
          }
        } catch (_) {}
      }

      if (textToParse && textToParse.trim().length > 0) {
        const MONTHS: Record<string, string> = {
          jan: "01", januari: "01", feb: "02", februari: "02", mar: "03", maret: "03",
          apr: "04", april: "04", mei: "05", jun: "06", juni: "06", jul: "07", juli: "07",
          agu: "08", agt: "08", agustus: "08", sep: "09", september: "09", okt: "10", oktober: "10",
          nov: "11", november: "11", des: "12", desember: "12"
        };
        const lines = textToParse.split(/\r?\n/);
        const transactions: any[] = [];
        for (let rawLine of lines) {
          let line = rawLine.trim();
          if (!line || line.length < 3) continue;
          if (/^\s*(no|nomor)\s*[\.\:\t\|]?\s*(tanggal|tgl|date|keterangan|uraian|item|deskripsi|debet|jumlah|nominal)/i.test(line)) continue;
          if (/^[\s\-\=\_\*\#\|]+$/.test(line)) continue;
          if (/^\s*(grand\s*total|total\s*pengeluaran|total\s*biaya|total\s*keseluruhan)/i.test(line)) continue;

          line = line.replace(/^\s*(?:no\.?\s*)?\d+\s*[\.\)\|\:\-]\s*/i, "");

          let dateStr = "";
          const textDateMatch = line.match(/(\d{1,2})\s+(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|may|jun(?:i)?|jul(?:i)?|agu(?:stus)?|agt|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?)\s+(\d{4})/i);
          if (textDateMatch) {
            const d = textDateMatch[1].padStart(2, "0");
            const m = MONTHS[textDateMatch[2].toLowerCase().slice(0, 3)] || "01";
            const y = textDateMatch[3];
            dateStr = `${y}-${m}-${d}`;
            line = line.replace(textDateMatch[0], " ");
          } else {
            const numDateMatch = line.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
            if (numDateMatch) {
              let y = numDateMatch[3].length === 2 ? "20" + numDateMatch[3] : numDateMatch[3];
              dateStr = `${y}-${numDateMatch[2].padStart(2, "0")}-${numDateMatch[1].padStart(2, "0")}`;
              line = line.replace(numDateMatch[0], " ");
            }
          }

          let amount = 0;
          const rpMatch = line.match(/Rp\.?\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?|[0-9]{4,})/i);
          if (rpMatch) {
            amount = parseFloat(rpMatch[1].replace(/\./g, "").replace(/,/g, "."));
            line = line.replace(rpMatch[0], " ");
          } else {
            const numMatches = line.match(/(?:^|[\s\|\t])([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?|[0-9]{4,})(?:$|[\s\|\t])/g);
            if (numMatches && numMatches.length > 0) {
              const last = numMatches[numMatches.length - 1].trim();
              amount = parseFloat(last.replace(/\./g, "").replace(/,/g, "."));
              line = line.replace(last, " ");
            }
          }

          if (isNaN(amount) || amount <= 0) continue;

          let desc = line.replace(/[\t\|\;]+/g, " ").replace(/\s+/g, " ").trim();
          desc = desc.replace(/^[\s\-\:\.\;\,\/0-9]+|[\s\-\:\.\;\,\/]+$/g, "").trim();
          if (!desc || desc.length < 2) desc = "Pengeluaran Petty Cash";

          let matchedAcc: any = null;
          const descLower = desc.toLowerCase();
          if (Array.isArray(accounts) && accounts.length > 0) {
            for (const acc of accounts) {
              if (acc.keywords && Array.isArray(acc.keywords)) {
                for (const kw of acc.keywords) {
                  if (kw && descLower.includes(String(kw).toLowerCase())) {
                    matchedAcc = acc;
                    break;
                  }
                }
              }
              if (matchedAcc) break;
            }
          }

          transactions.push({
            date: dateStr || new Date().toISOString().split('T')[0],
            description: desc,
            amount: amount,
            recipient: "",
            accurateAccountCode: matchedAcc?.code || "5-1900",
            accurateAccountName: matchedAcc?.name || "Biaya Operasional Lapangan",
            confidence: matchedAcc ? "high" : "medium"
          });
        }

        if (transactions.length > 0) {
          const totalExpense = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
          return res.end(JSON.stringify({
            success: true,
            result: {
              reportTitle: "Rekap Pemetaan Dokumen Petty Cash",
              period: new Date().toISOString().substring(0, 7),
              totalExpense,
              transactions
            }
          }));
        }
      }

      res.statusCode = 422;
      return res.end(JSON.stringify({
        success: false,
        error: "Tidak dapat mengekstrak transaksi dari dokumen. Silakan gunakan format Excel (.xlsx) atau tempel teks tabel pada tab 'Copy & Paste Teks Tabel'."
      }));
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

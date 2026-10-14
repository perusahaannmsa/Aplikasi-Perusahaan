import app from "../server";

export default function handler(req: any, res: any) {
  // Always set CORS headers so Vercel frontend or external domains can communicate
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  // Restore original URL when rewritten by Vercel
  try {
    const routeParam = req.query?._route;
    let cleanPath = "";
    if (routeParam) {
      cleanPath = Array.isArray(routeParam) ? routeParam.join("/") : String(routeParam);
    } else {
      const matched = (req.headers["x-matched-path"] as string) ||
                      (req.headers["x-vercel-original-url"] as string) ||
                      (req.headers["x-forwarded-uri"] as string) ||
                      (req.headers["x-original-uri"] as string) ||
                      req.url || "";
      if (typeof matched === "string" && matched.startsWith("/api/")) {
        cleanPath = matched.replace(/^\/api\//, "");
      }
    }

    const originalUrl = `/api/${cleanPath.replace(/^\/+/, "")}`;
    req.url = originalUrl;
    req.originalUrl = originalUrl;

    // Gracefully handle WhatsApp persistent bot endpoints on Vercel serverless environment
    // without returning 500 or crashing
    if (cleanPath.startsWith("wa/")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      if (cleanPath === "wa/status") {
        return res.end(JSON.stringify({
          success: true,
          status: "disconnected",
          qr: null,
          user: null,
          isVercelServerless: true,
          error: "Aplikasi dibuka dari hosting Vercel (Serverless). Bot WhatsApp Baileys memerlukan server Node.js 24/7 (seperti link resmi AI Studio atau Render). Buka tab 'Server Backend' di modal untuk menautkan URL backend."
        }));
      }
      if (cleanPath === "wa/keepalive-stats") {
        return res.end(JSON.stringify({
          uptimeSeconds: 0,
          totalPings: 0,
          isVercelServerless: true
        }));
      }
      if (cleanPath === "wa/security-settings") {
        return res.end(JSON.stringify({
          success: true,
          settings: {
            privacyMode: "whitelist",
            allowedPhones: [],
            securityPin: "1234",
            enableDriveLinks: true
          }
        }));
      }
    }

    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel API Gateway Error]", err);
    if (!res.headersSent) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        success: false,
        error: String(err?.message || "Internal server error"),
        notice: "WhatsApp Bot Baileys requires a continuous persistent Node.js server (Render / Railway / VPS / AI Studio Cloud) to maintain persistent WebSockets."
      }));
    }
  }
}

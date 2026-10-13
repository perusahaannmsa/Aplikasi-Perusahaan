import app from "../server";

export default function handler(req: any, res: any) {
  // Restore original URL when rewritten by Vercel
  try {
    const routeParam = req.query?._route;
    if (routeParam) {
      const cleanPath = Array.isArray(routeParam) ? routeParam.join("/") : routeParam;
      const originalUrl = `/api/${cleanPath}`;
      req.url = originalUrl;
    } else {
      const matched = (req.headers["x-matched-path"] as string) ||
                      (req.headers["x-vercel-original-url"] as string) ||
                      (req.headers["x-forwarded-uri"] as string) ||
                      (req.headers["x-original-uri"] as string);
      if (matched && typeof matched === "string" && matched.startsWith("/api")) {
        req.url = matched;
      }
    }

    // Always set CORS headers so Vercel frontend or external domains can communicate
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key");

    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      return res.end();
    }

    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel API Gateway Error]", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        success: false,
        error: "Vercel Serverless Function Error: " + (err?.message || "Unknown error"),
        notice: "WhatsApp Bot Baileys requires a continuous persistent Node.js server (Render / Railway / VPS) to maintain persistent WebSockets."
      }));
    }
  }
}

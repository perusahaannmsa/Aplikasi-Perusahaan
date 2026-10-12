import app from "../server.ts";

export default function handler(req: any, res: any) {
  // Normalize URL in case Vercel rewrites stripped the path
  const matchedPath = req.headers["x-matched-path"] || req.headers["x-now-route-matches"] || req.headers["x-forwarded-uri"];
  if (matchedPath && typeof matchedPath === "string" && matchedPath.startsWith("/api")) {
    req.url = matchedPath;
  } else if (req.query?.path && typeof req.query.path === "string") {
    const rawPath = Array.isArray(req.query.path) ? req.query.path.join("/") : req.query.path;
    req.url = "/api/" + rawPath;
  } else if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
  }
  return app(req, res);
}

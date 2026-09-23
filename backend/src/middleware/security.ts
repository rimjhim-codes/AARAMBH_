import { RequestHandler, Request, Response, NextFunction } from "express";
import { env } from "../config/env";

/** Helmet-equivalent baseline headers, kept local to avoid introducing a runtime dependency. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; form-action 'none';"
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
};

/** Simple CSRF protection for cookie-based auth validating Origin/Referer on state-changing requests */
export function requireCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  
  if (req.headers.authorization?.toLowerCase().startsWith("bearer ")) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    return res.status(403).json({ message: "CSRF protection: Missing Origin or Referer header" });
  }
  
  try {
    const originUrl = new URL(origin);
    const clientUrl = new URL(env.clientUrl);
    if (originUrl.origin !== clientUrl.origin) {
      return res.status(403).json({ message: "CSRF protection: Invalid Origin" });
    }
  } catch (err) {
    return res.status(403).json({ message: "CSRF protection: Malformed Origin" });
  }

  next();
}

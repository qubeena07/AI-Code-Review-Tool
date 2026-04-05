import rateLimit from "express-rate-limit";
import { Request } from "express";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: "Too many auth requests", code: "RATE_LIMIT_AUTH" },
});

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: "Too many webhook requests", code: "RATE_LIMIT_WEBHOOK" },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: Request) =>
    (req as Request & { userId?: string }).userId ?? req.ip ?? "unknown",
  message: { error: "Too many requests", code: "RATE_LIMIT_API" },
});

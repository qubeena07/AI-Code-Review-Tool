import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";

interface AppError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request & { id?: string },
  res: Response,
  _next: NextFunction
): void {
  const status =
    err.status === 400
      ? 400
      : err.status === 401
      ? 401
      : err.status === 429
      ? 429
      : 500;

  if (status === 500 && process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  (req as Request & { log?: { error: (...args: unknown[]) => void } }).log?.error(
    { err, status },
    "Request error"
  );

  res.status(status).json({
    error:
      status === 500 && process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    code: err.code ?? "INTERNAL_ERROR",
    requestId: (req as Request & { id?: string }).id,
  });
}

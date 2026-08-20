import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors";
import type { ApiErrorBody } from "../types/shared";
import multer from "multer";

/**
 * Central error handler. Every route delegates thrown/rejected errors here
 * via next(err) (or by using the asyncHandler wrapper), so error responses
 * are consistently shaped across the whole API.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof multer.MulterError) {
    const body: ApiErrorBody = {
      error: { code: `MULTER_${err.code}`, message: err.message },
    };
    res.status(400).json(body);
    return;
  }

  // Multer's fileFilter errors surface as plain Error instances.
  if (err instanceof Error) {
    const body: ApiErrorBody = {
      error: { code: "UPLOAD_ERROR", message: err.message },
    };
    res.status(400).json(body);
    return;
  }

  console.error("Unhandled error:", err);
  const body: ApiErrorBody = {
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  };
  res.status(500).json(body);
}

/** Wraps an async route handler so rejected promises reach errorHandler via next(). */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<void>>(
  fn: T
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
